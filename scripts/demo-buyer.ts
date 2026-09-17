// Demo buyer agent: performs the full x402 flow against a PayGate endpoint
// on Arc mainnet. Needs a wallet funded with a little USDC on Arc.
//
//   BUYER_PRIVATE_KEY=0x... PAYGATE_URL=http://localhost:3000 SLUG=crypto-prices \
//     npx tsx scripts/demo-buyer.ts

import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";

const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
const BASE = process.env.PAYGATE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "crypto-prices";

if (!BUYER_PRIVATE_KEY) {
  console.error("Set BUYER_PRIVATE_KEY (a wallet with USDC on Arc mainnet)");
  process.exit(1);
}

interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

async function main() {
  const account = privateKeyToAccount(BUYER_PRIVATE_KEY);
  const url = `${BASE}/api/x402/${SLUG}`;
  console.log(`Buyer: ${account.address}`);
  console.log(`1) GET ${url} (unpaid)`);

  const unpaid = await fetch(url);
  if (unpaid.status !== 402) {
    console.error(`Expected 402, got ${unpaid.status}`);
    console.error(await unpaid.text());
    process.exit(1);
  }
  const challenge = (await unpaid.json()) as {
    x402Version: number;
    resource: { url: string; description?: string; mimeType?: string };
    accepts: PaymentRequirements[];
  };
  const req = challenge.accepts[0];
  console.log(
    `2) 402 received: ${Number(req.amount) / 1e6} USDC on ${req.network} -> ${req.payTo}`,
  );

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
  console.log("3) EIP-3009 authorization signed");

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
      "Payment-Signature": Buffer.from(
        JSON.stringify(paymentPayload),
      ).toString("base64"),
    },
  });

  console.log(`4) Paid response: HTTP ${paid.status}`);
  const receipt = paid.headers.get("x-payment-receipt");
  if (receipt) console.log(`   Receipt: ${receipt}`);
  console.log("   Body:", (await paid.text()).slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
