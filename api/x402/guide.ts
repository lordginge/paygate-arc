// The 8-part builder guide: "Build your own x402 resource server on Arc".
// Served per-part behind the marketplace paywall (see /api/data/guide/:part).
// Reading the guide requires paying through the very mechanism it teaches.

export interface GuidePart {
  part: number;
  slug: string;
  title: string;
  body: string;
}

const STAMP_CONTRACT = "0xba2ec4dceafff136dbd8d371800c0b337753c679";
const USDC = "0x3600000000000000000000000000000000000000";

export const GUIDE_PARTS: GuidePart[] = [
  {
    part: 1,
    slug: "guide-1-moving-pieces",
    title: "Part 1: The moving pieces",
    body: `# Part 1: The moving pieces

An x402 resource server is just an HTTP server with one extra behaviour: when a request arrives without payment, it answers 402 Payment Required plus a machine-readable description of what to pay, where, and how. The buyer (usually an agent) signs the payment authorisation and retries. You verify and settle, then serve the real response.

On Arc, the stack is:

- **Chain**: Arc mainnet, chain ID 5042, gas paid in USDC, sub-cent fees. This is why per-call pricing below a cent is viable here and nowhere else.
- **Asset**: native USDC at ${USDC}, which supports EIP-3009 TransferWithAuthorization. The buyer signs an offchain authorisation; settlement moves the funds onchain.
- **Facilitator**: Circle's hosted facilitator at https://api.circle.com/v1/facilitator/x402. It verifies signatures and submits settlements, so you never touch a private key in the request path.
- **EIP-712 domain**: name "USDC", version "2", chainId 5042, verifyingContract ${USDC}. Get these four values exactly right or every signature fails.

The request lifecycle you are building:

1. Request arrives with no payment header.
2. You respond 402 with a PaymentRequired body: scheme "exact", network "eip155:5042", amount in USDC base units (6 decimals), your payTo address, and the EIP-712 extra fields.
3. Buyer signs and retries with the payload in the Payment-Signature header (base64-encoded JSON).
4. You verify and settle through the facilitator.
5. You serve the resource, plus receipt headers so the buyer can prove the exchange.

Part 2 sets up your keys and wallet. By part 5 you have a working paid endpoint; parts 6 to 8 add the receipt layer, idempotency, and discovery.`,
  },
  {
    part: 2,
    slug: "guide-2-keys-and-wallet",
    title: "Part 2: Keys, wallet, and payout address",
    body: `# Part 2: Keys, wallet, and payout address

Your server needs exactly two identities:

**A payout address (public).** Where the USDC lands. This can be any EVM address you control on Arc. It appears in every 402 you issue, so it is public by design. An address being public is safe; only the key behind it is sensitive.

**A Circle API key (secret).** Your facilitator credential. It lets you call verify and settle. It never appears in responses.

Rules that are not optional:

- Keys live in environment variables or your platform's secrets manager. Never in the repo, never in client code, never in a chat message. If a key is ever committed or pasted anywhere public, treat it as burned and rotate immediately; sweeper bots find leaked keys in minutes.
- Your payout address should be an address whose key you control offline or in a hardware wallet if sums will matter. Do not reuse an address whose seed phrase has ever left your custody for any reason.
- Keep a separate test wallet with dust for development. If your test wallet's key leaks, you lose dust and learn a lesson, not your treasury.

Environment shape:

\`\`\`
CIRCLE_API_KEY=...        # secret
PAYTO_ADDRESS=0x...       # your payout address, public
ARC_RPC=https://rpc.mainnet.arc.io
\`\`\`

If you sell through a marketplace like PayGate instead of standalone, settlement can route directly to your payout address while the marketplace handles the 402 machinery; part 8 covers that path. The rest of this guide assumes you are running your own server, because understanding the wire format matters even if you later delegate it.`,
  },
  {
    part: 3,
    slug: "guide-3-the-402-challenge",
    title: "Part 3: The 402 challenge",
    body: `# Part 3: The 402 challenge

The 402 response is the contract your server offers. Agents parse it and decide whether to pay. A correct challenge on Arc (Hono, but any framework works):

\`\`\`ts
app.get("/my-endpoint", async (c) => {
  const paymentHeader = c.req.header("payment-signature");
  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: new URL(c.req.url).toString(),
        description: "What this endpoint returns, in one sentence.",
        mimeType: "application/json",
      },
      accepts: [{
        scheme: "exact",
        network: "eip155:5042",
        amount: "2000",              // 0.002 USDC, 6 decimals
        asset: "${USDC}",
        payTo: process.env.PAYTO_ADDRESS,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USDC",
          version: "2",
          assetTransferMethod: "eip3009",
        },
      }],
    };
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
    return new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": encoded,
      },
    });
  }
  // paid path: part 4
});
\`\`\`

Details that bite people:

- **amount is base units.** 2000 = $0.002. Multiplying dollars by 1e6, never fewer decimals.
- **Both surfaces.** The JSON body and the base64 PAYMENT-REQUIRED header must carry the same document; different clients read different surfaces.
- **maxTimeoutSeconds** bounds how long the buyer's authorisation is valid. 60 seconds is the norm; the facilitator rejects stale authorisations.
- **Describe honestly.** resource.description is what an agent reads when deciding to pay. It is your entire sales pitch to a machine.

Test with curl before writing any payment code: you should see HTTP 402 and well-formed JSON. Part 4 handles the retry that comes back with a signature.`,
  },
  {
    part: 4,
    slug: "guide-4-verify-and-settle",
    title: "Part 4: Verify and settle with the facilitator",
    body: `# Part 4: Verify and settle with the facilitator

When the retry arrives, the Payment-Signature header holds base64 JSON containing the EIP-3009 signature and the authorisation fields. Your job: decode, verify, settle.

\`\`\`ts
const FACILITATOR = "https://api.circle.com/v1/facilitator/x402";

async function settle(paymentHeader: string, requirements: object) {
  const payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  const res = await fetch(\`\${FACILITATOR}/settle\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${process.env.CIRCLE_API_KEY}\`,
    },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
  });
  return res.json();
}
\`\`\`

The settle response gives you success, the transaction hash, and the payer address. Three failure shapes to handle:

- **Verification failure**: signature invalid, wrong domain values, expired validBefore. Return 402 again with the error; the buyer fixes and retries.
- **Pending**: settlement is submitted but not final. Poll the facilitator's status endpoint with the returned payment id until completed or failed. Do not serve the resource on pending.
- **Insufficient funds or rejected**: return 402 with the reason.

Only after a completed settle do you serve the resource. Also log every settlement (payer, amount, tx hash, timestamp) in your own database; part 6 turns that log into something publicly verifiable.

Idempotency note: the facilitator accepts an extensions field with a payment-identifier, which makes retried settle calls safe. Part 7 covers offering the same courtesy to your buyers.`,
  },
  {
    part: 5,
    slug: "guide-5-serve-and-receipt",
    title: "Part 5: Serve the resource and issue a receipt",
    body: `# Part 5: Serve the resource and issue a receipt

Settlement succeeded. Now serve the actual response, and attach proof so the buyer can show anyone that the exchange happened.

Minimum viable response:

\`\`\`ts
return new Response(JSON.stringify(data), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "X-Payment-Receipt": JSON.stringify({
      network: "eip155:5042",
      amount: requirements.amount,
      transaction: txHash,
      explorer: \`https://explorer.arc.io/tx/\${txHash}\`,
    }),
  },
});
\`\`\`

Conventions worth keeping:

- **The receipt header is the buyer's proof.** Include the settle transaction hash and an explorer link. Agents chain receipts into their own audit trails.
- **Fail honest.** If your upstream data source errors after a successful settle, return 502 with the tx hash still attached. The buyer paid; the receipt is theirs regardless, and your refund or retry policy should say so.
- **Log before serving.** Write the payment record to your database in the same handler, in a way where a logging failure cannot break the paid response. Wrap it in try/catch and move on.
- **Cache nothing sensitive.** Paid responses may be buyer-specific. Default to no-store unless the data is truly public and identical for all payers.

You now have a complete paid endpoint: 402 challenge, facilitator settle, served response, receipt header. Part 6 adds the piece most servers skip: stamping the fill to a public contract so your payment history does not depend on your own database.`,
  },
  {
    part: 6,
    slug: "guide-6-stamp-every-fill",
    title: "Part 6: Stamp every fill onchain",
    body: `# Part 6: Stamp every fill onchain

Your database says what you sold. A public contract says it in a way nobody can edit, including you. That is the stamp.

PayGateStamp is deployed on Arc at ${STAMP_CONTRACT} with one function:

\`\`\`
stamp(bytes32 paymentId, bytes32 termsHash, address buyer, address seller, bytes32 buyerRef)
\`\`\`

Call it after every settle:

\`\`\`ts
import { createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const stamper = createWalletClient({
  account: privateKeyToAccount(process.env.STAMP_PRIVATE_KEY as \`0x\${string}\`),
  transport: http(process.env.ARC_RPC),
});

await stamper.writeContract({
  address: "${STAMP_CONTRACT}",
  abi: [/* stamp ABI, one function */],
  functionName: "stamp",
  args: [
    paymentId,     // bytes32: keccak256 of the settle tx hash, or of "payid:"+identifier (part 7)
    termsHash,     // bytes32: keccak256 of "slug:price:payTo" so terms are provable
    payer,         // buyer address from the settle response
    payTo,         // your payout address
    zeroBuyerRef,  // 0x00..00 unless you use buyer references
  ],
  chain: arcMainnet,
});
\`\`\`

Design rules:

- **Never let stamping break a payment.** Wrap the broadcast, catch everything, surface the outcome in a response header (PayGate uses X-PayGate-Stamp with tx:hash, skipped:reason, or error:reason). A paid response must succeed even if the stamp fails.
- **The stamper key is a hot key with a small balance.** It only pays gas. Fund it with a few dollars of USDC, top up when low. Compromise of this key costs gas dust, not revenue.
- **Anyone can now audit you.** That is the point. Your sales history is reconstructable from the contract by buyers, marketplaces, and indexers, which is exactly why buyers trust stamped servers more than screenshots.

Part 7 makes the stamp key carry your buyer's own idempotency identifier.`,
  },
  {
    part: 7,
    slug: "guide-7-payment-identifier",
    title: "Part 7: Idempotency with payment-identifier",
    body: `# Part 7: Idempotency with payment-identifier

Networks flake, agents retry, and a naive paid endpoint charges twice for one intent. The x402 payment-identifier extension fixes this, and you should offer it.

**Declare it on your 402s:**

\`\`\`ts
extensions: {
  "payment-identifier": {
    info: { required: false },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        required: { type: "boolean" },
        id: { type: "string", minLength: 16, maxLength: 128, pattern: "^[a-zA-Z0-9_-]+$" },
      },
      required: ["required"],
    },
  },
}
\`\`\`

**Enforce it on the paid path.** Extract \`payload.extensions["payment-identifier"].info.id\`, validate it against the pattern, and keep a table keyed by the id with a fingerprint of the request (slug + amount + payTo):

- **New id**: settle, serve, store id plus fingerprint.
- **Same id, same fingerprint**: this is a retry of a settled payment. Re-serve the response without settling again. Include deduplicated: true in the receipt so the buyer knows.
- **Same id, different fingerprint**: someone is reusing a key across different requests. Refuse with 409.
- **No id**: process normally; never block buyers who do not speak the extension.

**Bind it to the stamp.** When the buyer supplied an id, stamp with paymentId = keccak256("payid:" + id) instead of the settle tx hash. The buyer's offchain idempotency key is now the onchain anchor: anyone can recompute the hash and find the stamp, and replays provably share one record.

Fail open on the bookkeeping: if your id table is unavailable, log the error and process the payment normally. Dedup is a courtesy layer; payments must never depend on it.

Part 8: get discovered.`,
  },
  {
    part: 8,
    slug: "guide-8-discovery-and-next",
    title: "Part 8: Discovery, registries, and what comes next",
    body: `# Part 8: Discovery, registries, and what comes next

A paid endpoint nobody can find is a demo. Discovery for x402 is registry-driven: agents query catalogues, they do not browse websites.

**Registries that matter:**

- **x402scan**: the ecosystem index, organised by payTo address and origin. Your payment history accrues to that identity, so pick your payTo once and keep it. Changing addresses starts your reputation from zero.
- **Bazaar** (Coinbase's discovery layer) and aggregators built on top of it. Complete, honest metadata in your 402 resource block is what these index: description, mimeType, accurate pricing.

**Marketplace listing.** Listing on a marketplace like PayGate (https://paygatex402.com) gives you the whole stack hosted: 402 machinery, facilitator settlement to your own payout address, stamping, logs, and trial-credit traffic from buyers who arrive with $1 to spend. You keep your upstream; the marketplace is the front door. Standalone servers and listed endpoints coexist fine.

**What comes next, so you build for it now:**

- **Batch settlement.** Payment channels where the buyer deposits once and each call carries a signed cumulative voucher, with hundreds of calls claimed in one onchain transaction. When it lands on Arc, per-call gas disappears entirely. Servers that already stamp and handle idempotency will adopt it in days; servers that hard-coded "one call equals one settle" will rewrite.
- **Sessions and identity** (SIWx): wallet-signed sessions so repeat buyers authenticate once. Design your payer tracking around addresses, not API keys, and this drops in later.
- **The verification norm.** As volume grows, the servers that can prove their history (stamps, receipts, idempotent records) are the ones agents and marketplaces will prefer. Build the proof in now; it is much harder to retrofit trust.

You made it. You have a paid endpoint on Arc, settled through Circle, receipted onchain, idempotent for your buyers, and discoverable by agents. Sell something worth paying for.`,
  },
];

export function getGuidePart(part: number): GuidePart | undefined {
  return GUIDE_PARTS.find((p) => p.part === part);
}
