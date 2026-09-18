// Arc mainnet + Circle Facilitator Service configuration.
// Secrets come from the environment and are never committed.

import { loadDotenv } from "../lib/dotenv-safe";

await loadDotenv();

export const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID ?? "5042"); // Arc mainnet
export const ARC_NETWORK = `eip155:${ARC_CHAIN_ID}`;
export const ARC_RPC =
  process.env.ARC_RPC ?? "https://rpc.mainnet.arc.io";

// Ordered RPC candidates: dedicated node first (ARC_RPC), then optional
// comma-separated fallbacks, then the public endpoint as last resort.
export const ARC_RPC_URLS: string[] = [
  ARC_RPC,
  ...(process.env.ARC_RPC_FALLBACKS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  "https://rpc.mainnet.arc.io",
].filter((u, i, a) => a.indexOf(u) === i);

// Base mainnet (PerCall PoC chain; cross-chain reads, liquidity comparisons).
export const BASE_RPC =
  process.env.BASE_RPC ?? "https://mainnet.base.org";
export const BASE_RPC_URLS: string[] = [
  BASE_RPC,
  ...(process.env.BASE_RPC_FALLBACKS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  "https://mainnet.base.org",
].filter((u, i, a) => a.indexOf(u) === i);

// Robinhood Chain mainnet (Arbitrum Orbit L2, chain 4663; tokenized
// equities/RWA collateral venue. Gas = ETH).
export const ROBINHOOD_CHAIN_ID = Number(process.env.ROBINHOOD_CHAIN_ID ?? "4663");
export const ROBINHOOD_RPC =
  process.env.ROBINHOOD_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_RPC_URLS: string[] = [
  ROBINHOOD_RPC,
  ...(process.env.ROBINHOOD_RPC_FALLBACKS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  "https://rpc.mainnet.chain.robinhood.com",
].filter((u, i, a) => a.indexOf(u) === i);

// JSON-RPC call with failover across a candidate URL list.
async function rpcWithFailover<T>(
  urls: string[],
  method: string,
  params: unknown[],
): Promise<T> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const data = (await res.json()) as { result?: T; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message ?? "RPC error");
      return data.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
}

export function arcRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  return rpcWithFailover<T>(ARC_RPC_URLS, method, params);
}

export function baseRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  return rpcWithFailover<T>(BASE_RPC_URLS, method, params);
}

export function robinhoodRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  return rpcWithFailover<T>(ROBINHOOD_RPC_URLS, method, params);
}
export const ARC_EXPLORER =
  process.env.ARC_EXPLORER ?? "https://explorer.arc.io";

// USDC on Arc (native gas token, exposed as an EIP-3009 contract).
export const USDC_ADDRESS =
  process.env.USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;
export const USDC_EIP712_NAME = "USDC";
export const USDC_EIP712_VERSION = "2";

// Circle Facilitator Service (hosted x402 facilitator).
export const FACILITATOR_BASE =
  process.env.FACILITATOR_BASE ?? "https://api.circle.com/v1/facilitator/x402";

// Platform treasury: receives USDC for marketplace sales in v1.
// Per-seller payout addresses arrive in v2 once seller-side proof
// delegation is built. Tracked per endpoint in Supabase meanwhile.
export const TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS ??
  "") as `0x${string}`;

export const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";
export const SELLER_PRIVATE_KEY = (process.env.SELLER_PRIVATE_KEY ??
  "") as `0x${string}`;

export function x402Configured(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!TREASURY_ADDRESS) missing.push("TREASURY_ADDRESS");
  if (!CIRCLE_API_KEY) missing.push("CIRCLE_API_KEY");
  if (!SELLER_PRIVATE_KEY) missing.push("SELLER_PRIVATE_KEY");
  return { ok: missing.length === 0, missing };
}

export function toBaseUnits(priceUsdc: number | string): string {
  const price = typeof priceUsdc === "string" ? Number(priceUsdc) : priceUsdc;
  return Math.round(price * 10 ** USDC_DECIMALS).toString();
}
