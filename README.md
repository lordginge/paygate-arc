# PayGate — turn API calls into collateral

**Pay-per-call API marketplace on Arc.** Wrap any HTTP endpoint with an x402 paywall and get paid in native USDC on Arc mainnet, settled in real time by Circle's Facilitator Service. Every settled call is stamped on-chain — and seller float can be supplied to Aave V4 as collateral, turning payment history into working capital.

**Live:** paygatex402.com — 16 endpoints, 126+ payments settled on Arc mainnet, auditable on-chain.

## The problem

x402 gave AI agents a way to pay per call — but API sellers still have to assemble the entire merchant stack themselves: the 402 challenge, EIP-3009 verification, facilitator settlement, receipts, an earnings ledger. And once revenue arrives as micropayments, it's dead capital — too small and irregular to borrow against.

PayGate is the missing merchant layer for Arc. Sellers point it at any HTTPS endpoint and set a USDC price. Buyers get a correct x402 v2 challenge, sign with EIP-3009, and Circle's Facilitator settles on-chain in under a second. Sellers track earnings on a dashboard, and their payment history is stamped to a contract — the seed of a credit line, not just a payout.


## What it does

- Sellers register an Arc wallet, list an endpoint (upstream URL + USDC price per call), and receive a gateway URL: `/api/x402/<slug>`
- Buyers (humans or AI agents) call the URL. Unpaid calls get HTTP 402 with a base64 `PAYMENT-REQUIRED` header (x402 v2, `exact` scheme, USDC at `0x3600000000000000000000000000000000000000`, network `eip155:5042`)
- The buyer signs an EIP-3009 `TransferWithAuthorization` and retries with a `Payment-Signature` header
- PayGate settles through Circle Facilitator Service (seller proof + API key auth, pending-status polling, idempotency via `payment-identifier`), proxies the call upstream, logs the payment, and returns an `X-Payment-Receipt` header with the Arc transaction hash
- Sellers track earnings on the dashboard; unpaid traffic never reaches the upstream API

## Stack

React 19 + Vite + Tailwind + shadcn/ui (frontend) · Hono + tRPC (backend) · Supabase/Postgres (ledger) · viem (EIP-712/EIP-3009) · Circle Facilitator Service (x402 settlement)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Copy `.env.example` to `.env` and fill in the values. Secrets (`SELLER_PRIVATE_KEY`, `CIRCLE_API_KEY`) are server-side only and never committed.

| Variable | Purpose |
|---|---|
| `CIRCLE_API_KEY` | Circle developer API key (console.circle.com) |
| `TREASURY_ADDRESS` | Arc wallet receiving USDC (payTo) |
| `SELLER_PRIVATE_KEY` | Private key controlling `TREASURY_ADDRESS`, signs facilitator seller proofs |
| `SUPABASE_URL` / `SUPABASE_KEY` | Ledger (publishable key; RLS-gated) |

## Demo buyer

```bash
BUYER_PRIVATE_KEY=0x... PAYGATE_URL=http://localhost:3000 SLUG=crypto-prices \
  npx tsx scripts/demo-buyer.ts
```

Performs the full flow: unpaid 402, EIP-3009 signature, paid retry, prints the response and Arc tx receipt.

## Arc mainnet details

- Chain ID: `5042` · RPC: `https://rpc.mainnet.arc.io` · Explorer: `https://explorer.arc.io`
- Gas and payments are in native USDC (6-decimal EIP-3009 contract at `0x3600...0000`)

## Roadmap

- v1 (this repo): single platform treasury, per-endpoint earnings ledger
- v2: direct per-seller settlement addresses, buyer SDK package, webhook receipts
