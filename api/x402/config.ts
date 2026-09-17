// Arc mainnet + Circle Facilitator Service configuration.
// Secrets come from the environment and are never committed.

import "dotenv/config";

export const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID ?? "5042"); // Arc mainnet
export const ARC_NETWORK = `eip155:${ARC_CHAIN_ID}`;
export const ARC_RPC =
  process.env.ARC_RPC ?? "https://rpc.mainnet.arc.io";
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
