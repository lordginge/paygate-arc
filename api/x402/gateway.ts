// x402 payment gateway for registered marketplace endpoints.
// Flow: unpaid request -> 402 + PAYMENT-REQUIRED -> buyer retries with
// Payment-Signature -> we probe the upstream, settle via Circle Facilitator
// on Arc only if the upstream delivered, then serve the fetched body.

import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { sbSelect, sbInsert, sbUpsert } from "../lib/supabase";
import {
  ARC_NETWORK,
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  TREASURY_ADDRESS,
  USDC_ADDRESS,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
  toBaseUnits,
  x402Configured,
} from "./config";
import {
  settlePayment,
  pollStatus,
  type PaymentRequirements,
} from "./facilitator";
import type { Payee } from "./proof";
import { assertSafeUpstreamUrl } from "../lib/ssrf";
import { keccak256, toBytes } from "viem";

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  upstream_url: string;
  price_usdc: string;
  sellers?: {
    payout_address: string | null;
    circle_wallet_id: string | null;
  } | null;
}

export const x402Gateway = new Hono<{ Bindings: HttpBindings }>();

// Surface the real error message instead of Hono's bare "Internal Server
// Error" so facilitator/settle failures are diagnosable from the response.
x402Gateway.onError((err, c) => {
  console.error("x402 gateway error:", err);
  return c.json(
    { error: String((err as Error)?.message ?? err) },
    500,
  );
});

// ---- Trial voucher: x402-shaped, zero-value, no settle -------------------
// First-login template call. Buyer signs a 0-value EIP-3009 authorisation
// (same motion as a real paid call), we verify locally and issue $1 credit.
x402Gateway.all("/trial-voucher", async (c) => {
  // Vouchers hand out real credit, so this is the most farmable route in
  // the product. The wallet signature already proves control of a fresh
  // address; the limiter stops one caller from spraying it from a single
  // vantage point. Per-isolate damping, not a global quota.
  {
    const { callerKey, rateLimited } = await import("../lib/rateLimit");
    const { limited, retryAfterSec } = rateLimited(
      callerKey(c.req.raw, "trial-voucher"),
      { limit: 10, windowMs: 3_600_000 },
    );
    if (limited) {
      return c.json(
        { error: "Too many voucher claims, retry later" },
        429,
        { "Retry-After": String(retryAfterSec) },
      );
    }
  }

  const resourceUrl = new URL(c.req.url);
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: ARC_NETWORK,
    amount: "0",
    asset: USDC_ADDRESS,
    payTo: TREASURY_ADDRESS,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
  };

  const paymentHeader =
    c.req.header("payment-signature") ?? c.req.header("x-payment");
  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: resourceUrl.toString(),
        description:
          "Claim your trial voucher: $1 of endpoint credit, valid 30 days. Sign a zero-value authorisation to prove wallet control; no funds move.",
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    return new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      },
    });
  }

  let payload: {
    payload?: { signature?: `0x${string}`; authorization?: Record<string, unknown> };
  };
  try {
    payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  } catch {
    return c.json({ error: "Malformed Payment-Signature header" }, 400);
  }
  const sig = payload.payload?.signature;
  const auth = payload.payload?.authorization as
    | { from: `0x${string}`; to: string; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` }
    | undefined;
  if (!sig || !auth) return c.json({ error: "Missing signature or authorization" }, 400);

  // Must be a zero-value authorisation to the treasury.
  if (auth.value !== "0" || auth.to.toLowerCase() !== TREASURY_ADDRESS.toLowerCase()) {
    return c.json({ error: "Voucher claims must be zero-value to the treasury" }, 400);
  }

  const { verifyTypedData } = await import("viem");
  const valid = await verifyTypedData({
    address: auth.from,
    domain: { name: "USDC", version: "2", chainId: ARC_CHAIN_ID, verifyingContract: USDC_ADDRESS as `0x${string}` },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" },
        { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to as `0x${string}`,
      value: BigInt(0),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
    signature: sig,
  });
  if (!valid) return c.json({ error: "Signature verification failed" }, 402);

  const wallet = auth.from.toLowerCase();
  const existing = await sbSelect(
    "trial_vouchers",
    `wallet_address=eq.${wallet}&select=wallet_address,expires_at`,
  );
  if (existing.length > 0) {
    return c.json(
      { error: "Voucher already claimed for this wallet", expires_at: (existing[0] as { expires_at: string }).expires_at },
      409,
    );
  }
  const rows = await sbInsert("trial_vouchers", {
    wallet_address: wallet,
    credits_total: 1,
    credits_used: 0,
    request_signature: sig.slice(0, 20) + "…",
  });
  return c.json({
    voucher: rows[0],
    credits_usdc: 1,
    valid_days: 30,
    how_to_use:
      "Call any endpoint with X-TRIAL-WALLET, X-TRIAL-TS and X-TRIAL-SIG (sign 'paygate-trial:<slug>:<ts>') instead of X-PAYMENT.",
  });
});

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "payment-signature",
  "x-payment",
  "transfer-encoding",
  "accept-encoding",
]);

// ---- x402 payment-identifier extension -----------------------------------
// Buyer-supplied idempotency key (spec: x402-foundation/x402,
// packages/extensions/src/payment-identifier). We declare it on 402s so
// aware clients attach an ID; replays of a settled ID with the same request
// fingerprint are re-served without a second settle, and a replay with a
// different fingerprint is refused with 409.
const PAYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PAYMENT_IDENTIFIER_DECLARATION = {
  info: { required: false },
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      required: { type: "boolean" },
      id: { type: "string", minLength: 16, maxLength: 128, pattern: "^[a-zA-Z0-9_-]+$" },
    },
    required: ["required"],
  },
} as const;

function extractPaymentIdentifier(payload: unknown): string | null {
  const info = (payload as { extensions?: Record<string, { info?: { id?: unknown } }> })
    ?.extensions?.["payment-identifier"]?.info;
  const id = info?.id;
  if (typeof id !== "string" || id.length < 16 || id.length > 128 || !PAYMENT_ID_PATTERN.test(id)) return null;
  return id;
}

function payFingerprint(slug: string, amount: string, payTo: string): string {
  return `${slug}:${amount}:${payTo.toLowerCase()}`;
}

x402Gateway.all("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const rows = await sbSelect<EndpointRow>(
    "endpoints",
    `slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=id,slug,name,description,upstream_url,price_usdc,sellers(payout_address,circle_wallet_id)`,
  );
  const endpoint = rows[0];
  if (!endpoint) {
    return c.json({ error: "Unknown or inactive endpoint", slug }, 404);
  }

  // Payments settle straight to the seller's Circle wallet when they have
  // one; otherwise to the platform treasury (legacy v1 endpoints).
  const payee: Payee = endpoint.sellers?.payout_address
    ? {
        payTo: endpoint.sellers.payout_address,
        circleWalletId: endpoint.sellers.circle_wallet_id,
      }
    : { payTo: TREASURY_ADDRESS };

  const resourceUrl = new URL(c.req.url);
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: ARC_NETWORK,
    amount: toBaseUnits(endpoint.price_usdc),
    asset: USDC_ADDRESS,
    payTo: payee.payTo,
    maxTimeoutSeconds: 60,
    extra: {
      name: USDC_EIP712_NAME,
      version: USDC_EIP712_VERSION,
      assetTransferMethod: "eip3009",
    },
  };

  const paymentHeader =
    c.req.header("payment-signature") ?? c.req.header("x-payment");

  // Trial-credit redemption headers (alternative to a paid settle).
  const trialWallet = c.req.header("x-trial-wallet");
  const trialSig = c.req.header("x-trial-sig") as `0x${string}` | undefined;
  const trialTs = c.req.header("x-trial-ts");

  // ---- Unpaid request: return the 402 challenge ---------------------------
  if (!paymentHeader && !(trialWallet && trialSig && trialTs)) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: resourceUrl.toString(),
        description: endpoint.description || endpoint.name,
        mimeType: "application/json",
      },
      accepts: [requirements],
      extensions: {
        "payment-identifier": PAYMENT_IDENTIFIER_DECLARATION,
        // Bazaar discovery extension (x402 extensions spec): lets x402scan
        // and facilitator catalogs index the route as invocable. The gateway
        // proxies arbitrary upstreams, so input mirrors the request method
        // with no declared body schema, output is endpoint-specific JSON.
        bazaar: {
          info: {
            input: { type: "http", method: c.req.method },
            output: { type: "json" },
          },
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
      "base64",
    );
    return new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": encoded,
      },
    });
  }

  let txHash = "";
  let payer = "";
  let trialMode = false;
  let paymentIdentifier: string | null = null;
  let dedupReplay = false;

  // ---- Proxy helper (defined before use, closes over context) -------------
  // Builds the upstream request WITHOUT the buyer's payment headers. The
  // base64 payment-signature is large and must never be forwarded to a
  // seller's upstream (it is both a leak and trips header-size limits).
  // Provenance headers are NOT set here; they are response-side, added after
  // a successful settle.
  const STRIP_TO_UPSTREAM = new Set([
    ...HOP_BY_HOP,
    "x-trial-wallet",
    "x-trial-ts",
    "x-trial-sig",
    // Buyer credentials must never reach a seller's upstream: the gateway
    // proxies arbitrary registered hosts, so an Authorization header or
    // cookie aimed at PayGate would be handed to whoever registered the URL.
    "authorization",
    "cookie",
  ]);
  async function fetchUpstream(): Promise<Response> {
    const fwdHeaders = new Headers();
    c.req.raw.headers.forEach((value, key) => {
      if (!STRIP_TO_UPSTREAM.has(key.toLowerCase())) fwdHeaders.set(key, value);
    });
    fwdHeaders.delete("x-paygate-internal");
    const internalKey = process.env.INTERNAL_API_KEY ?? "";

    const hasBody = !["GET", "HEAD"].includes(c.req.method);
    const body = hasBody ? await c.req.raw.arrayBuffer() : undefined;

    if (endpoint.upstream_url.startsWith("/")) {
      // SECURITY: the internal key is stamped ONLY on in-process dispatch.
      // It is the sole guard on the paywalled first-party routes under
      // /api/data/* (see api/data.ts), so it must never leave this Worker.
      // Attaching it to the external branch below would hand it to any
      // seller who points upstream_url at a host they control.
      if (internalKey) fwdHeaders.set("x-paygate-internal", internalKey);
      const { dataApi } = await import("../data");
      const u = new URL(endpoint.upstream_url, "http://internal");
      resourceUrl.searchParams.forEach((v, k) => u.searchParams.append(k, v));
      const internalPath =
        u.pathname.replace(/^\/api\/data/, "") + u.search;
      return dataApi.request(internalPath, {
        method: c.req.method,
        headers: fwdHeaders,
        body,
      });
    }
    // SSRF guard: seller-registered upstreams must be public https hosts on
    // 443 resolving to public IPs only. Registration validates too, but URLs
    // pre-dating validation and DNS changes both make a fetch-time check
    // mandatory. Throws UnsafeUpstreamError -> caught below as 502.
    const upstreamUrl = await assertSafeUpstreamUrl(endpoint.upstream_url);
    resourceUrl.searchParams.forEach((v, k) =>
      upstreamUrl.searchParams.append(k, v),
    );
    // redirect:"error" so a 30x to an internal host cannot bypass the
    // validation above (we never follow, we fail).
    return fetch(upstreamUrl, {
      method: c.req.method,
      headers: fwdHeaders,
      body,
      redirect: "error",
    });
  }

  // ---- Upstream probe BEFORE settlement -----------------------------------
  // The cardinal rule of a paid gateway: never take money for goods that did
  // not arrive. Fetch the seller's upstream first (without disclosing any
  // payment). Only if it succeeds do we settle the buyer's authorisation and
  // then serve the already-fetched body. If the upstream errors or is
  // unreachable, we return 502 and the buyer's signed authorisation is simply
  // never submitted, so no USDC moves. This converts "paid but got a 429 from
  // CoinGecko" into "not charged".
  //
  // Dedup replays skip the settle but still re-serve the resource, so they
  // probe the upstream too (a replay of a settled payment is entitled to the
  // goods). Trial mode settles nothing by definition, but still probes.
  let upstream: Response | null = null;
  const shouldServe =
    paymentHeader || (trialWallet && trialSig && trialTs);
  if (shouldServe) {
    // Probe amplification damping: the probe fires on header presence alone
    // (before signature verification), so a caller can make the Worker fetch
    // a seller's upstream for free. Per-isolate fixed window per slug per
    // caller; paid callers are unaffected below this rate.
    const { callerKey, rateLimited } = await import("../lib/rateLimit");
    const rl = rateLimited(callerKey(c.req.raw, `probe:${slug}`), {
      limit: 60,
      windowMs: 60_000,
    });
    if (rl.limited) {
      return c.json(
        { error: "Too many requests, retry later" },
        429,
        { "Retry-After": String(rl.retryAfterSec) },
      );
    }
    try {
      upstream = await fetchUpstream();
    } catch (e) {
      console.error("fetchUpstream threw:", e);
      return c.json(
        { error: "Upstream fetch error; payment NOT taken" },
        502,
      );
    }
    if (!upstream.ok) {
      // Do NOT echo the upstream body: the probe fires on any request with a
      // payment-shaped header, before any signature check, so relaying body
      // content would make the gateway a read oracle for whatever URL a
      // seller registered.
      return c.json(
        {
          error: "Upstream endpoint failed; payment NOT taken",
          upstreamStatus: upstream.status,
        },
        502,
      );
    }
  }

  if (paymentHeader) {
    // ---- Paid request: settle then serve ----------------------------------
    // Circle-wallet payees sign via the Circle Sign API, so the platform
    // seller key is only required for legacy treasury-paid endpoints.
    const cfg = x402Configured();
    if (!cfg.ok && !payee.circleWalletId) {
      return c.json(
        {
          error: "Settlement not configured on this deployment",
          missing: cfg.missing,
        },
        503,
      );
    }

    let paymentPayload: unknown;
    try {
      paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8"),
      );
    } catch {
      return c.json({ error: "Malformed Payment-Signature header" }, 400);
    }

    // payment-identifier dedup: a valid ID that already settled for this
    // exact fingerprint is served from the record, no second settle. The
    // lookup fails open (dedup inactive, payments unaffected) if the
    // payment_ids table is not provisioned on this deployment.
    paymentIdentifier = extractPaymentIdentifier(paymentPayload);
    if (paymentIdentifier) {
      const fingerprint = payFingerprint(slug, requirements.amount, payee.payTo);
      const prior = await sbSelect<{
        fingerprint: string;
        tx_hash: string | null;
        payer_address: string;
      }>(
        "payment_ids",
        `id=eq.${encodeURIComponent(paymentIdentifier)}&select=fingerprint,tx_hash,payer_address`,
      ).catch((e) => {
        console.error("payment_ids lookup failed:", e);
        return [] as { fingerprint: string; tx_hash: string | null; payer_address: string }[];
      });
      const record = prior[0];
      if (record && record.fingerprint === fingerprint) {
        dedupReplay = true;
        txHash = record.tx_hash ?? "";
        payer = record.payer_address ?? "";
      } else if (record) {
        return c.json(
          {
            error: "payment-identifier replayed with a different request fingerprint",
            id: paymentIdentifier,
          },
          409,
        );
      }
    }

    if (!dedupReplay) {
      const settled = await settlePayment(paymentPayload, requirements, payee, paymentIdentifier);

      txHash = settled.transaction ?? "";
      payer = settled.payer ?? "";

      if (!settled.success && settled.pending) {
        const final = await pollStatus(
          settled.pending.paymentId,
          settled.pending.retryAfterMs,
          payee,
        );
        if (final.status !== "completed") {
          return c.json(
            { error: "Payment settlement did not complete", status: final.status },
            402,
          );
        }
        txHash = final.transaction ?? "";
      } else if (!settled.success) {
        return c.json({ error: settled.error ?? "Settlement failed" }, 402);
      }

      // Ledger row for EVERY real settle, not just identifier carries. The
      // indexer and /verify attribute on-chain settlements by joining
      // payment_ids.tx_hash; without an unconditional insert, fills from
      // buyers that do not send a payment-identifier (most of them) settle
      // on-chain but never attribute, leaving the proof layer blind to our
      // own marketplace's payments. The identifier path stays keyed by the
      // caller's id for dedup; the fallback path is keyed by tx hash so the
      // same settle can never land twice.
      const ledgerRow = {
        fingerprint: payFingerprint(slug, requirements.amount, payee.payTo),
        endpoint_id: endpoint.id,
        payer_address: payer || "unknown",
        tx_hash: txHash || null,
      };
      if (paymentIdentifier) {
        await sbInsert("payment_ids", {
          id: paymentIdentifier,
          ...ledgerRow,
        }).catch((e) => console.error("payment_ids insert failed:", e));
      } else if (txHash) {
        await sbUpsert(
          "payment_ids",
          { id: `tx:${txHash.toLowerCase()}`, ...ledgerRow },
          "id",
        ).catch((e) => console.error("payment_ids upsert failed:", e));
      }
    }
  } else {
    // ---- Trial credit redemption ------------------------------------------
    // X-TRIAL-WALLET + X-TRIAL-TS + X-TRIAL-SIG (personal_sign of
    // "paygate-trial:<slug>:<ts>", 5-minute window). Deducts from the
    // wallet's voucher via the redeem_credit RPC; no USDC moves.
    trialMode = true;
    const walletHdr = trialWallet!;
    const ts = Number(trialTs);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
      return c.json({ error: "Trial timestamp outside the 5-minute window" }, 402);
    }
    const { verifyMessage } = await import("viem");
    const ok = await verifyMessage({
      address: walletHdr as `0x${string}`,
      message: `paygate-trial:${slug}:${trialTs}`,
      signature: trialSig!,
    });
    if (!ok) return c.json({ error: "Trial signature verification failed" }, 402);

    const { sbRpc } = await import("../lib/supabase");
    const price = Number(endpoint.price_usdc);
    const redeemed = await sbRpc<boolean>("redeem_credit", {
      p_wallet: walletHdr.toLowerCase(),
      p_amount: price,
    }).catch(() => false);
    if (!redeemed) {
      return c.json(
        { error: "No active trial credit (or insufficient balance). Claim a voucher at /api/x402/trial-voucher or pay with X-PAYMENT." },
        402,
      );
    }
    payer = walletHdr.toLowerCase();
  }

  // Log the settled payment.
  await sbInsert("payments", {
    endpoint_id: endpoint.id,
    payer_address: payer || "unknown",
    amount_usdc: endpoint.price_usdc,
    tx_hash: txHash || null,
    network: "arc",
    status: trialMode ? "trial" : dedupReplay ? "dedup" : "settled",
  }).catch((e) => console.error("payment log failed:", e));

  // Stamp the fill on the PayGateStamp contract. The broadcast is awaited
  // inline (~1s) because this runtime's background handle is not guaranteed;
  // only the receipt-wait is backgrounded. A stamp failure must never break
  // a settled payment or a redeemed trial. The outcome is surfaced in the
  // X-PayGate-Stamp response header so deployments are verifiable without
  // log access.
  let stampHeader = "skipped:not-configured";
  if (trialMode) {
    // Trial redemptions move no real money and are farmable across fresh
    // wallets. Stamping every redemption would burn stamper gas on spam, so
    // trial fills are intentionally not stamped. Paid fills always stamp.
    stampHeader = "skipped:trial";
  } else if (dedupReplay) {
    // Replay of an already-stamped payment: the stamp from the original
    // settle is the onchain record, so there is nothing new to stamp.
    stampHeader = "skipped:dedup-replay";
  } else try {
    const { stampConfigured, sendStampFill, waitForStamp, termsHashFor, buyerRefFor } =
      await import("./stamp");
    if (stampConfigured()) {
      const termsHash = termsHashFor(
        slug,
        String(endpoint.price_usdc),
        payee.payTo,
      );
      const paymentId = (
        trialMode
          ? keccak256(toBytes(`trial:${slug}:${payer}:${trialTs}`))
          : paymentIdentifier
            ? keccak256(toBytes(`payid:${paymentIdentifier}`))
            : txHash
      ) as `0x${string}`;
      const buyerRef = trialMode
        ? buyerRefFor(payer)
        : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);
      const stampHash = await sendStampFill({
        paymentId,
        termsHash,
        buyer: payer,
        seller: payee.payTo,
        buyerRef,
      }).catch((e) => {
        console.error("stamp broadcast failed:", e);
        stampHeader = `error:${String((e as Error)?.message ?? e).slice(0, 120)}`;
        return null;
      });
      if (stampHash) {
        console.log("fill stamped:", stampHash);
        stampHeader = `tx:${stampHash}`;
        // waitUntil throws synchronously in runtimes where executionCtx
        // exists but isn't wired ("This context has no ExecutionContext").
        // Isolate it so it can never clobber the success header.
        try {
          c.executionCtx?.waitUntil(waitForStamp(stampHash));
        } catch {
          console.log("waitUntil unavailable; stamp already broadcast");
        }
      }
    }
  } catch (e) {
    console.error("stamp hook failed:", e);
    stampHeader = `error:${String((e as Error)?.message ?? e).slice(0, 120)}`;
  }

  // Serve the upstream response fetched before settlement. Payment
  // provenance headers are attached to the response (not the upstream
  // request, which already happened without them by design).
  if (!upstream) {
    // Defensive: shouldServe guarantees upstream was fetched for any path
    // that reaches here. If logic ever changes, fail closed.
    return c.json({ error: "Upstream not fetched" }, 500);
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  responseHeaders.set("X-PayGate-Stamp", stampHeader);
  responseHeaders.set(
    "X-Payment-Receipt",
    JSON.stringify({
      network: ARC_NETWORK,
      amount: requirements.amount,
      transaction: txHash,
      explorer: txHash ? `${ARC_EXPLORER}/tx/${txHash}` : null,
      ...(paymentIdentifier ? { paymentIdentifier } : {}),
      ...(dedupReplay ? { deduplicated: true } : {}),
    }),
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
