// Circle developer-controlled wallets: one Arc wallet per seller.
// The wallet address becomes the endpoint's payTo, so payments settle
// directly to the seller. Facilitator seller proofs are signed through
// Circle's Sign API, so no private keys ever touch this codebase.
//
// Requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and CIRCLE_WALLET_SET_ID
// (run `npx tsx scripts/setup-circle.ts` once to provision the latter two).
// Every function degrades gracefully: walletsReady() reports configuration.

import { loadDotenv } from "../lib/dotenv-safe.js";

await loadDotenv();

const {
  CIRCLE_API_KEY = "",
  CIRCLE_ENTITY_SECRET = "",
  CIRCLE_WALLET_SET_ID = "",
} = process.env;

export function walletsReady() {
  return Boolean(CIRCLE_API_KEY && CIRCLE_ENTITY_SECRET && CIRCLE_WALLET_SET_ID);
}

type CircleClient = Awaited<
  ReturnType<typeof import("@circle-fin/developer-controlled-wallets")["initiateDeveloperControlledWalletsClient"]>
>;

let clientPromise: Promise<CircleClient> | null = null;

async function getClient(): Promise<CircleClient> {
  if (!walletsReady()) {
    throw new Error(
      "Circle Wallets not configured. Run `npx tsx scripts/setup-circle.ts` after enabling Developer Wallets in the Circle Console.",
    );
  }
  if (!clientPromise) {
    clientPromise = import("@circle-fin/developer-controlled-wallets").then(
      (m) =>
        m.initiateDeveloperControlledWalletsClient({
          apiKey: CIRCLE_API_KEY,
          entitySecret: CIRCLE_ENTITY_SECRET,
        }) as unknown as CircleClient,
    );
  }
  return clientPromise;
}

/** Create a fresh Arc mainnet wallet for a seller. */
export async function createSellerWallet(): Promise<{
  walletId: string;
  address: string;
}> {
  const client = await getClient();
  const res = await client.createWallets({
    walletSetId: CIRCLE_WALLET_SET_ID,
    blockchains: ["ARC"],
    count: 1,
    accountType: "EOA",
  });
  const w = res.data?.wallets?.[0];
  if (!w?.id || !w.address) throw new Error("Circle wallet creation failed");
  return { walletId: w.id, address: w.address };
}

/** Sign EIP-712 typed data with a seller's Circle wallet. */
export async function signSellerTypedData(
  walletId: string,
  typedData: Record<string, unknown>,
): Promise<string> {
  const client = await getClient();
  const res = await client.signTypedData({
    walletId,
    data: JSON.stringify(typedData),
  });
  const sig = res.data?.signature;
  if (!sig) throw new Error("Circle signTypedData returned no signature");
  return sig;
}

/** Native USDC balance of a wallet on Arc, in USDC units (number). */
export async function getWalletUsdcBalance(walletId: string): Promise<number> {
  const client = await getClient();
  const res = await client.getWalletTokenBalance({ id: walletId });
  const balances = res.data?.tokenBalances ?? [];
  // On Arc, USDC is the native token: prefer the native entry, else USDC symbol
  const native = balances.find((b) => b.token?.isNative);
  const usdc = balances.find((b) => b.token?.symbol === "USDC");
  const chosen = native ?? usdc;
  return chosen?.amount ? Number(chosen.amount) : 0;
}

/** Transfer USDC (native on Arc) from a seller wallet to their own address. */
export async function withdrawTo(
  walletId: string,
  destinationAddress: string,
  amount: string,
): Promise<string> {
  const client = await getClient();
  const res = await client.createTransaction({
    walletId,
    // SDK's transaction enum lags the chain list; ARC is supported at runtime.
    blockchain: "ARC" as never,
    // Empty tokenAddress = native token; USDC is the native token on Arc.
    tokenAddress: "",
    destinationAddress,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data?.id;
  if (!id) throw new Error("Circle transfer returned no transaction id");
  return id;
}
