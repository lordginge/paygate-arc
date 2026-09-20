// PayGateStamp settle-hook.
// After a fill settles (paid) or a trial credit redeems (custodial), write a
// stamp to the PayGateStamp contract on Arc. The transaction is broadcast
// inline (callers await sendStampFill before responding, ~1s) because a
// Worker's background handle is not guaranteed to exist in every runtime;
// only the slow receipt-wait is backgrounded. Every failure path only logs.
// A failed stamp must never break a settled payment.

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const STAMP_CONTRACT = "0xba2ec4dceafff136dbd8d371800c0b337753c679" as const;

const ARC = {
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
} as const;

const STAMP_ABI = [
  {
    type: "function",
    name: "stamp",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "termsHash", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "buyerRef", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

const isHexAddress = (v: string): v is `0x${string}` =>
  /^0x[0-9a-fA-F]{40}$/.test(v);

export function stampConfigured(): boolean {
  return Boolean(process.env.STAMP_PRIVATE_KEY);
}

// Stable hash of what was sold: endpoint, price and who got paid.
export function termsHashFor(
  slug: string,
  priceUsdc: string,
  payTo: string,
): Hex {
  return keccak256(toBytes(`${slug}|${price_usdcNormalised(priceUsdc)}|${payTo.toLowerCase()}`));
}

function price_usdcNormalised(p: string): string {
  const n = Number(p);
  return Number.isFinite(n) ? n.toFixed(6) : p;
}

// Identity anchor for custodial/trial fills: credit accrues to a hash of the
// user's wallet so it is claimable later without us storing identities.
export function buyerRefFor(wallet: string): Hex {
  return keccak256(toBytes(`paygate-identity:${wallet.toLowerCase()}`));
}

export interface StampInput {
  // Paid fills: the settlement tx hash (already bytes32).
  // Trials: keccak256 of trial identifiers, supplied by caller.
  paymentId: Hex;
  termsHash: Hex;
  buyer?: string;
  seller?: string;
  buyerRef?: Hex;
}

// Broadcast the stamp and return the tx hash as soon as Arc accepts it.
// Does NOT wait for inclusion; pair with waitForStamp in a background task.
export async function sendStampFill(input: StampInput): Promise<Hex> {
  const pk = process.env.STAMP_PRIVATE_KEY;
  if (!pk) throw new Error("STAMP_PRIVATE_KEY not set");

  const account = privateKeyToAccount(pk as Hex);
  const transport = http(ARC.rpcUrls.default.http[0]);
  const wallet = createWalletClient({ account, chain: ARC, transport });

  return wallet.writeContract({
    address: STAMP_CONTRACT,
    abi: STAMP_ABI,
    functionName: "stamp",
    args: [
      input.paymentId,
      input.termsHash,
      input.buyer && isHexAddress(input.buyer) ? input.buyer : ZERO_ADDRESS,
      input.seller && isHexAddress(input.seller) ? input.seller : ZERO_ADDRESS,
      input.buyerRef ?? ZERO_BYTES32,
    ],
  });
}

// Inclusion wait, safe to run in the background. Logs and swallows failures:
// the stamp is already broadcast, this only confirms it landed.
export async function waitForStamp(hash: Hex): Promise<void> {
  try {
    const transport = http(ARC.rpcUrls.default.http[0]);
    const pub = createPublicClient({ chain: ARC, transport });
    await pub.waitForTransactionReceipt({ hash, timeout: 15_000 });
  } catch (e) {
    console.error("stamp receipt wait failed:", e);
  }
}
