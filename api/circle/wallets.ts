/**
 * Circle developer-controlled wallets (W3S) — per-seller payout wallets on Arc.
 *
 * The SDK is imported lazily so local dev and CI work without the dependency
 * configured; walletsReady() gates every call site.
 */

export interface SellerWallet {
  walletId: string;
  address: string;
}

interface CircleClient {
  createWallets(input: {
    walletSetId: string;
    blockchains: string[];
    count: number;
    accountType: "EOA";
  }): Promise<{ data?: { wallets?: Array<{ id: string; address: string }> } }>;
  signTypedData(input: {
    walletId: string;
    data: string;
  }): Promise<{ data?: { signature?: string } }>;
  getWalletTokenBalance(input: {
    id: string;
  }): Promise<{
    data?: {
      tokenBalances?: Array<{
        token: { symbol?: string; isNative?: boolean };
        amount: string;
      }>;
    };
  }>;
  createTransaction(input: Record<string, unknown>): Promise<{
    data?: { id?: string };
  }>;
}

let clientPromise: Promise<CircleClient> | null = null;

function getClient(): Promise<CircleClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const sdk = await import("@circle-fin/developer-controlled-wallets");
      return sdk.initiateDeveloperControlledWalletsClient({
        apiKey: process.env.CIRCLE_API_KEY ?? "",
        entitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
      }) as unknown as CircleClient;
    })();
  }
  return clientPromise;
}

/** True when all three wallet env vars are configured. */
export function walletsReady(): boolean {
  return Boolean(
    process.env.CIRCLE_API_KEY &&
      process.env.CIRCLE_ENTITY_SECRET &&
      process.env.CIRCLE_WALLET_SET_ID,
  );
}

/** Provision a new seller payout wallet on Arc inside the shared wallet set. */
export async function createSellerWallet(): Promise<SellerWallet> {
  const client = await getClient();
  const res = await client.createWallets({
    walletSetId: process.env.CIRCLE_WALLET_SET_ID ?? "",
    blockchains: ["ARC"],
    count: 1,
    accountType: "EOA",
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Circle returned no wallet");
  }
  return { walletId: wallet.id, address: wallet.address };
}

/** Sign an EIP-712 payload with the seller's Circle wallet (key stays at Circle). */
export async function signSellerTypedData(
  walletId: string,
  typedData: unknown,
): Promise<string> {
  const client = await getClient();
  const res = await client.signTypedData({
    walletId,
    data: JSON.stringify(typedData),
  });
  const signature = res.data?.signature;
  if (!signature) {
    throw new Error("Circle returned no signature");
  }
  return signature;
}

/** USDC balance of a Circle wallet, as a float (6-decimal token). */
export async function getWalletUsdcBalance(walletId: string): Promise<number> {
  const client = await getClient();
  const res = await client.getWalletTokenBalance({ id: walletId });
  const balances = res.data?.tokenBalances ?? [];
  // On Arc, USDC is the native gas token — prefer the native entry.
  const entry =
    balances.find((b) => b.token.isNative) ??
    balances.find((b) => b.token.symbol === "USDC");
  return entry ? Number(entry.amount) : 0;
}

/** Transfer the wallet's USDC to the seller's own address. Returns the tx id. */
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
  if (!id) {
    throw new Error("Circle returned no transaction id");
  }
  return id;
}
