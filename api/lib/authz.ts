// Wallet-ownership proof for marketplace mutations.
// Mirrors the trial-flow pattern: the caller signs a short message with
// personal_sign, the server verifies it against the claimed address. A
// 5-minute timestamp window stops replays, the per-action label stops one
// proof being reused for a different action.

import { verifyMessage } from "viem";

const PROOF_WINDOW_SECONDS = 300;

export async function verifyWalletProof(
  action: string,
  walletAddress: string,
  signature: string,
  ts: number,
): Promise<void> {
  const addr = walletAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    throw new Error("Invalid wallet address");
  }
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > PROOF_WINDOW_SECONDS) {
    throw new Error("Proof timestamp outside the 5-minute window");
  }
  const valid = await verifyMessage({
    address: addr as `0x${string}`,
    message: `paygate-${action}:${addr}:${ts}`,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) {
    throw new Error(`Invalid wallet proof for ${action}`);
  }
}
