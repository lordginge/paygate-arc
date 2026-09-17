// Self-funding agent: an autonomous buyer that lives on its own Arc USDC
// balance. It discovers PayGate endpoints, pays per call via x402, watches
// its wallet, and stops or idles when funds run low. If the same wallet is
// also registered as a seller, its Circle payout wallet refills from other
// buyers: spend on one side, earn on the other.
//
//   AGENT_PRIVATE_KEY=0x... PAYGATE_URL=http://localhost:3000 \
//     npx tsx scripts/agent.ts
//
// Policy knobs (env):
//   TICK_SECONDS=30        how often it buys a call
//   FLOOR_USDC=0.05        stop buying below this balance (keeps gas money)
//   MAX_SPEND_USDC=0       lifetime spend cap, 0 = uncapped
//   MAX_CALLS=0            stop after N calls, 0 = unlimited
//   STRATEGY=cheapest      cheapest | random | roundrobin

import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatUnits, toHex } from "viem";

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const BASE = process.env.PAYGATE_URL ?? "http://localhost:3000";
const ARC_RPC = process.env.ARC_RPC ?? "https://rpc.mainnet.arc.io";

const TICK_SECONDS = Number(process.env.TICK_SECONDS ?? 30);
const FLOOR_USDC = Number(process.env.FLOOR_USDC ?? 0.05);
const MAX_SPEND_USDC = Number(process.env.MAX_SPEND_USDC ?? 0);
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 0);
const STRATEGY = process.env.STRATEGY ?? "cheapest";

if (!AGENT_PRIVATE_KEY) {
  console.error("Set AGENT_PRIVATE_KEY (a wallet with USDC on Arc mainnet)");
  process.exit(1);
}

const account = privateKeyToAccount(AGENT_PRIVATE_KEY);

// USDC is the native gas token on Arc: native balance == spendable USDC.
const arc = {
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

const client = createPublicClient({ chain: arc, transport: http(ARC_RPC) });

interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

interface ListedEndpoint {
  id: string;
  slug: string;
  name: string;
  price_usdc: string;
}

async function balanceUsdc(): Promise<number> {
  const bal = await client.getBalance({ address: account.address });
  return Number(formatUnits(bal, 6));
}

async function discover(): Promise<ListedEndpoint[]> {
  const url = `${BASE}/api/trpc/marketplace.listEndpoints?batch=1&input=${encodeURIComponent(
    '{"0":{"json":null}}',
  )}`;
  const res = await fetch(url);
  const json = (await res.json()) as [
    { result?: { data?: { json?: ListedEndpoint[] } } },
  ];
  return json[0]?.result?.data?.json ?? [];
}

function pick(
  endpoints: ListedEndpoint[],
  roundRobin: { i: number },
): ListedEndpoint | undefined {
  if (endpoints.length === 0) return undefined;
  if (STRATEGY === "random") {
    return endpoints[Math.floor(Math.random() * endpoints.length)];
  }
  if (STRATEGY === "roundrobin") {
    return endpoints[roundRobin.i++ % endpoints.length];
  }
  return [...endpoints].sort(
    (a, b) => Number(a.price_usdc) - Number(b.price_usdc),
  )[0];
}

async function payCall(slug: string): Promise<{ ok: boolean; cost: number; tx?: string }> {
  const url = `${BASE}/api/x402/${slug}`;

  const unpaid = await fetch(url);
  if (unpaid.status !== 402) {
    return { ok: false, cost: 0 };
  }
  const challenge = (await unpaid.json()) as {
    x402Version: number;
    resource: { url: string; description?: string; mimeType?: string };
    accepts: PaymentRequirements[];
  };
  const req = challenge.accepts[0];

  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const chainId = Number(req.network.split(":")[1]);

  const signature = await account.signTypedData({
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId,
      verifyingContract: req.asset as `0x${string}`,
    },
    types: {
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
    message: {
      from: account.address,
      to: req.payTo as `0x${string}`,
      value: BigInt(req.amount),
      validAfter: 0n,
      validBefore,
      nonce,
    },
  });

  const paymentPayload = {
    x402Version: 2,
    resource: challenge.resource,
    accepted: req,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: req.payTo,
        value: req.amount,
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  const paid = await fetch(url, {
    headers: {
      "Payment-Signature": Buffer.from(JSON.stringify(paymentPayload)).toString(
        "base64",
      ),
    },
  });

  let tx: string | undefined;
  const receipt = paid.headers.get("x-payment-receipt");
  if (receipt) {
    try {
      tx = (JSON.parse(receipt) as { transaction?: string }).transaction;
    } catch {
      /* receipt is informational */
    }
  }
  return {
    ok: paid.status === 200,
    cost: Number(req.amount) / 1e6,
    tx,
  };
}

async function main() {
  console.log(`Agent wallet: ${account.address}`);
  console.log(
    `Policy: tick=${TICK_SECONDS}s floor=${FLOOR_USDC} USDC strategy=${STRATEGY}` +
      (MAX_SPEND_USDC ? ` maxSpend=${MAX_SPEND_USDC}` : "") +
      (MAX_CALLS ? ` maxCalls=${MAX_CALLS}` : ""),
  );

  let spent = 0;
  let calls = 0;
  const rr = { i: 0 };

  for (;;) {
    const balance = await balanceUsdc();

    if (balance < FLOOR_USDC) {
      console.log(
        `[${new Date().toISOString()}] balance ${balance.toFixed(4)} USDC below floor, idling. Top up the wallet to resume.`,
      );
      await sleep(TICK_SECONDS * 4);
      continue;
    }
    if (MAX_SPEND_USDC && spent >= MAX_SPEND_USDC) {
      console.log(`Lifetime spend cap reached (${spent.toFixed(4)} USDC). Done.`);
      break;
    }
    if (MAX_CALLS && calls >= MAX_CALLS) {
      console.log(`Call cap reached (${calls}). Done.`);
      break;
    }

    const endpoints = await discover();
    const target = pick(endpoints, rr);
    if (!target) {
      console.log("No endpoints listed yet, waiting.");
      await sleep(TICK_SECONDS);
      continue;
    }

    const price = Number(target.price_usdc);
    if (balance - price < FLOOR_USDC) {
      console.log(
        `Skipping ${target.slug}: ${price} USDC would breach the floor.`,
      );
      await sleep(TICK_SECONDS);
      continue;
    }

    const result = await payCall(target.slug);
    if (result.ok) {
      spent += result.cost;
      calls += 1;
      console.log(
        `[${new Date().toISOString()}] PAID ${result.cost.toFixed(4)} USDC -> ${target.slug}` +
          (result.tx ? ` tx=${result.tx}` : "") +
          ` | spent=${spent.toFixed(4)} balance~=${(balance - result.cost).toFixed(4)}`,
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] call to ${target.slug} failed, backing off`,
      );
      await sleep(TICK_SECONDS * 2);
      continue;
    }

    await sleep(TICK_SECONDS);
  }
}

function sleep(seconds: number) {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
