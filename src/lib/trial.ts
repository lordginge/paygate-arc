// Browser trial flow: connect wallet -> sign a ZERO-VALUE EIP-3009
// authorisation (same motion as a paid x402 call, no funds move) -> claim a
// $1 credit voucher -> spend credit on any endpoint via signed headers.
// No real USDC is involved at any point.

export const ARC_CHAIN_ID = 5042;
export const ARC_CHAIN_HEX = "0x" + ARC_CHAIN_ID.toString(16); // 0x13b2
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const TREASURY_ADDRESS = "0x57607f9296385571CbD8Df14D8728B7CB839743D";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

export function getProvider(): Eip1193 | null {
  const w = window as unknown as { ethereum?: Eip1193 };
  return w.ethereum ?? null;
}

export async function connectArc(): Promise<`0x${string}`> {
  const eth = getProvider();
  if (!eth) throw new Error("No wallet found. Install MetaMask or another EIP-1193 wallet.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_HEX }] });
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ARC_CHAIN_HEX,
          chainName: "Arc",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.arc.io"],
          blockExplorerUrls: ["https://explorer.arc.io"],
        }],
      });
    } else {
      throw e;
    }
  }
  return accounts[0].toLowerCase() as `0x${string}`;
}

function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// Sign a zero-value TransferWithAuthorization and claim the $1 voucher.
export async function claimVoucher(account: `0x${string}`): Promise<void> {
  const eth = getProvider();
  if (!eth) throw new Error("No wallet found");
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account,
    to: TREASURY_ADDRESS,
    value: "0",
    validAfter: "0",
    validBefore: String(now + 3600),
    nonce: randomNonce(),
  };
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    domain: {
      name: "USDC",
      version: "2",
      chainId: ARC_CHAIN_ID,
      verifyingContract: USDC_ADDRESS,
    },
    message: authorization,
  };
  const signature = (await eth.request({
    method: "eth_signTypedData_v4",
    params: [account, JSON.stringify(typedData)],
  })) as string;

  const payload = {
    x402Version: 2,
    payload: { signature, authorization },
  };
  const res = await fetch("/api/x402/trial-voucher", {
    method: "POST",
    headers: {
      "payment-signature": btoa(JSON.stringify(payload)),
      "content-type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Voucher claim failed (${res.status})`);
  }
}

// Spend trial credit on an endpoint. Returns { status, data, remainingHint }.
export async function spendTrial(
  account: `0x${string}`,
  slug: string,
  ask?: string,
): Promise<{ status: number; data: unknown }> {
  const eth = getProvider();
  if (!eth) throw new Error("No wallet found");
  const ts = Math.floor(Date.now() / 1000);
  const sig = (await eth.request({
    method: "personal_sign",
    params: [`paygate-trial:${slug}:${ts}`, account],
  })) as string;
  const qs = ask?.trim() ? `?ask=${encodeURIComponent(ask.trim())}` : "";
  const res = await fetch(`/api/x402/${slug}${qs}`, {
    headers: {
      "x-trial-wallet": account,
      "x-trial-ts": String(ts),
      "x-trial-sig": sig,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Call failed (${res.status})`);
  }
  return { status: res.status, data };
}

export interface TrialBalance {
  claimed: boolean;
  expired?: boolean;
  expires_at?: string;
  balance_usdc: number;
}

export async function getTrialBalance(account: string): Promise<TrialBalance> {
  const res = await fetch(`/api/data/trial/balance/${account.toLowerCase()}`);
  return (await res.json()) as TrialBalance;
}
