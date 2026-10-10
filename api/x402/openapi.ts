// Dynamic OpenAPI builder — the spec is derived from the live endpoints
// table (same source the 402 challenges use), so prices, descriptions and
// the endpoint list can never drift from what buyers are actually charged.
// Static openapi-spec.json remains only as an emergency fallback when the
// DB is unreachable.
//
// Future endpoints: any row with active=true appears here automatically on
// the next request (60s isolate cache). New endpoints default to POST;
// add the slug to GET_SLUGS if it is a GET endpoint (until a `method`
// column lands in the schema).
import { sbSelect } from "../lib/supabase";
import {
  ARC_NETWORK,
  USDC_ADDRESS,
  TREASURY_ADDRESS,
} from "./config";

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  price_usdc: string;
  sellers?: { payout_address: string | null }[] | null;
}

// Endpoints served over GET (everything else is treated as POST).
const GET_SLUGS = new Set([
  "crypto-prices",
  "crypto-ticker",
  "momentum-signal",
  "aave-arc-rates",
  "arc-chain-status",
  "guide-1-moving-pieces",
  "guide-2-keys-and-wallet",
  "guide-3-the-402-challenge",
  "guide-4-verify-and-settle",
  "guide-5-serve-and-receipt",
  "guide-6-stamp-every-fill",
  "guide-7-payment-identifier",
  "guide-8-discovery-and-next",
]);

// Marketplace `category` values (as registered by sellers) mapped to the
// Agent Marketplace Discovery API enum.
const CATEGORY_MAP: Record<string, string> = {
  general: "WEB_SEARCH_RESEARCH",
  meta: "WEB_SEARCH_RESEARCH",
  rwa: "FINANCIAL_ANALYSIS",
  "market-data": "FINANCIAL_ANALYSIS",
  credit: "FINANCIAL_ANALYSIS",
  signals: "FINANCIAL_ANALYSIS",
  "chain-data": "INFRASTRUCTURE",
  guide: "INFRASTRUCTURE",
};

let cache: { at: number; rows: EndpointRow[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchActiveEndpoints(): Promise<EndpointRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = await sbSelect<EndpointRow>(
    "endpoints",
    "active=eq.true&order=created_at.desc&select=id,slug,name,description,category,price_usdc,sellers(payout_address)",
  );
  const list = rows ?? [];
  cache = { at: Date.now(), rows: list };
  return list;
}

function payToFor(ep: EndpointRow): string {
  return ep.sellers?.[0]?.payout_address || TREASURY_ADDRESS;
}

function categoryFor(ep: EndpointRow): string {
  return CATEGORY_MAP[ep.category ?? ""] ?? "INFRASTRUCTURE";
}

// Build the full OpenAPI 3.1 document from live DB rows. Throws on DB
// failure so the caller can fall back to the static spec.
export async function buildOpenApiSpec(): Promise<Record<string, unknown>> {
  const endpoints = await fetchActiveEndpoints();
  if (endpoints.length === 0) throw new Error("no active endpoints");

  const paths: Record<string, unknown> = {};
  for (const ep of endpoints) {
    const verb = GET_SLUGS.has(ep.slug) ? "get" : "post";
    const amountAtomic = BigInt(
      Math.round(Number(ep.price_usdc) * 1_000_000),
    ).toString();
    const usd = (Number(ep.price_usdc)).toFixed(6);
    const payTo = payToFor(ep);
    const op = {
      summary: ep.name,
      description:
        "x402 pay-per-call endpoint. Unpaid calls return HTTP 402 with a PAYMENT-REQUIRED challenge (x402 v2, exact scheme, EIP-3009 USDC on eip155:5042). " +
        `Price: $${Number(ep.price_usdc)} USDC per call. Docs: https://paygatex402.com/docs`,
      operationId: ep.slug,
      tags: ["x402", categoryFor(ep).toLowerCase(), "usdc"],
      "x-x402": {
        network: ARC_NETWORK,
        asset: USDC_ADDRESS,
        scheme: "exact",
        amount: amountAtomic,
        payTo,
        assetTransferMethod: "eip3009",
        facilitator: "circle",
        category: categoryFor(ep),
      },
      "x-payment-info": {
        protocols: ["x402"],
        price: { mode: "fixed", currency: "USDC", amount: usd },
      },
      responses: {
        "402": {
          description:
            "Payment required - x402 v2 challenge in PAYMENT-REQUIRED header (base64 JSON)",
          headers: {
            "PAYMENT-REQUIRED": {
              description: "Base64-encoded x402 v2 PaymentRequired JSON",
              schema: { type: "string" },
            },
          },
        },
        "200": {
          description: "Paid response",
          content: {
            "application/json": { schema: { type: "object" } },
          },
        },
      },
    };
    paths[`/api/x402/${ep.slug}`] =
      verb === "post"
        ? {
            post: {
              ...op,
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          }
        : {
            get: {
              ...op,
              parameters: [
                {
                  name: "input",
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                  description:
                    "Endpoint-specific query parameters - see https://paygatex402.com/docs",
                },
              ],
            },
          };
  }

  return {
    openapi: "3.1.0",
    $schema: "https://spec.openapis.org/oas/3.1/dialect/latest",
    info: {
      title: "PayGate x402 Marketplace API",
      version: "2.1.0",
      description:
        "Pay-per-call API marketplace on Arc mainnet. Every endpoint is x402 v2 compliant: unpaid requests return HTTP 402 with a PAYMENT-REQUIRED challenge; callers sign an EIP-3009 USDC authorization and retry with a Payment-Signature header; settlement runs through Circle's Facilitator Service; every settled fill is stamped on-chain for public verification.",
      contact: {
        name: "PayGate x402",
        url: "https://paygatex402.com",
        email: "lordginge82@gmail.com",
      },
      "x-guidance": `PayGate x402 is a pay-per-call API marketplace on Arc mainnet (eip155:5042). HOW TO PAY: 1) Call any endpoint below without auth — you get HTTP 402 with a PAYMENT-REQUIRED header containing a base64 x402 v2 challenge (accepts[]: scheme "exact", asset USDC 0x3600...0000, amount in 6-decimal base units, payTo wallet). 2) Sign an EIP-3009 TransferWithAuthorization (domain: name "USDC", version "2", chainId 5042) for exactly that amount. 3) Retry the same request with a Payment-Signature header carrying the base64-signed payload. 4) Circle's Facilitator verifies then settles on-chain; the paid response returns your data plus an X-Payment-Receipt header with the Arc tx hash. PRICES: fixed per endpoint, live values in each operation's x-payment-info.price (currency USDC) — the challenge amount always matches. CATEGORIES: market data (crypto-prices, crypto-ticker, order-book-depth, momentum-signal), RWA (centrifuge-rwa-*: pools, pool detail, share-class tokens), web extraction (extractr-arc: POST a URL, get clean text+summary), infrastructure (arc-rpc: read-only JSON-RPC proxy; arc-chain-status), and paid builder guides. RECOMMENDED FIRST CALL: GET /api/x402/crypto-prices?ids=ethereum&vs_currencies=usd ($0.001). TRIAL CREDIT: every new wallet can claim $1 of trial credit at paygatex402.com (sign a 0-value EIP-3009 voucher at /api/x402/trial-voucher) — sandbox-priced endpoints are free against it. ERRORS: 403 payment verification failed; 502 upstream failure after settlement is auto-refunded in ledger. Paid calls have no rate limit (payment is the throttle). Support: lordginge82@gmail.com. Docs: https://paygatex402.com/docs.`,
    },
    servers: [{ url: "https://paygatex402.com" }],
    "x-provider": {
      name: "PayGate x402",
      website: "https://paygatex402.com",
      docsUrl: "https://paygatex402.com/docs",
      category: "INFRASTRUCTURE",
      tags: ["x402", "arc", "usdc", "pay-per-call", "marketplace"],
    },
    paths,
  };
}

// Resource list for /.well-known/x402 — all active endpoint URLs.
export async function buildWellKnownResources(origin: string): Promise<string[]> {
  const endpoints = await fetchActiveEndpoints();
  return endpoints.map((ep) => `${origin}/api/x402/${ep.slug}`);
}
