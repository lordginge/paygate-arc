// Wallet-ownership proofs for marketplace mutations. Mirrors the server-side
// verifier in api/lib/authz.ts: personal_sign of "paygate-<action>:<addr>:<ts>".

import { getProvider } from "./trial";

export async function signWalletProof(
  action: string,
  walletAddress: string,
): Promise<{ signature: string; ts: number }> {
  const eth = getProvider();
  if (!eth) throw new Error("No wallet found. Connect your wallet first.");
  const ts = Math.floor(Date.now() / 1000);
  const signature = (await eth.request({
    method: "personal_sign",
    params: [`paygate-${action}:${walletAddress.toLowerCase()}:${ts}`, walletAddress],
  })) as string;
  return { signature, ts };
}
