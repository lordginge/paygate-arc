# PayGate x402

## Live: [paygatex402.com](https://paygatex402.com)

![network](https://img.shields.io/badge/network-Arc%20mainnet%20%C2%B7%205042-3B6DFF)
![protocol](https://img.shields.io/badge/protocol-x402%20v2-3B6DFF)
![settlement](https://img.shields.io/badge/settlement-Circle%20Facilitator-3B6DFF)
![status](https://img.shields.io/badge/status-live%20on%20paygatex402.com-2ea043)

Pay-per-call API marketplace: wrap any HTTP API with an **x402 paywall** and get paid in **USDC on Arc mainnet**, settled by Circle's Facilitator Service.

**Try it without spending anything:** the [live site](https://paygatex402.com) issues a **$1 trial credit** on first wallet login — you sign a zero-value authorisation (no USDC moves) and can call any endpoint.

Built for the [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail) programme.

## What it does

- Sellers register an Arc wallet, list an endpoint (upstream URL + USDC price per call), and receive a gateway URL: `/api/x402/<slug>`
- Buyers (humans or AI agents) call the URL. Unpaid calls get HTTP 402 with a base64 `PAYMENT-REQUIRED` header (x402 v2, `exact` scheme, USDC at `0x3600000000000000000000000000000000000000`, network `eip155:5042`)
- The buyer signs an EIP-3009 `TransferWithAuthorization` and retries with a `Payment-Signature` header
- PayGate settles through Circle Facilitator Service (seller proof + API key auth, pending-status polling, idempotency via `payment-identifier`), proxies the call upstream, logs the payment, and returns an `X-Payment-Receipt` header with the Arc transaction hash
- Sellers track earnings on the dashboard; unpaid traffic never reaches the upstream API
- Trial vouchers: first login claims $1 of credit (30 days, one per wallet) via a zero-value EIP-3009 signature; redemption through signed headers, no funds moved

## Verified on-chain

Settles through this gateway are publicly verifiable on Arc mainnet, e.g.:

- `0x7856d5688406f562c0a2c87cbd373f0a491ec27a6cd6d4461988f66b1ce1fbcd` — full production loop on paygatex402.com (402 → EIP-3009 → settle → 200 + data)
- `0x9d6056bd721d1290050db1d1d5030faae2c8575df509948b7e9e9b2bad60cc77` — paid endpoint-request channel
- `0x5250f4e9f897bcd692e18fbc427d9b84718402c592768c2fe6317f2b9ac5fe75` — first Aave V4 USDC supply from platform float

## Stack

React 19 + Vite + Tailwind + shadcn/ui (frontend) · Hono + tRPC (backend) · Supabase/Postgres (ledger) · viem (EIP-712/EIP-3009) · Circle Facilitator Service (x402 settlement) · Cloudflare Workers (production, auto-deploy from this repo)

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

Performs the full flow: unpaid 402, EIP-3009 signature, paid retry, prints the response and Arc tx receipt. Also runs against the live site with `PAYGATE_URL=https://paygatex402.com`.

## Arc mainnet details

- Chain ID: `5042` · RPC: `https://rpc.mainnet.arc.io` · Explorer: `https://explorer.arc.io`
- Gas and payments are in native USDC (6-decimal EIP-3009 contract at `0x3600...0000`)

## Roadmap

- v1 (this repo): single platform treasury, per-endpoint earnings ledger — **live**
- v2: direct per-seller settlement addresses, buyer SDK package, webhook receipts
