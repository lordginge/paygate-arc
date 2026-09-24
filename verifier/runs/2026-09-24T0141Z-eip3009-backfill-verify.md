# Verify run — EIP-3009 indexer backfill (2026-09-24T01:41Z)

**Verdict: FAIL — backfill not complete; the sweep is stalled, not merely behind.**
Settlements are `0` because the cursor (12.87M) has never reached the settlement-bearing
blocks (~21.89M), not because of a topic-pairing or attribution defect. The conditional
debug branch ("0 despite caughtUp") was therefore not triggered; pairing and attribution
were validated proactively on-chain anyway and are sound (see §4).

## 1. Acceptance criteria vs observed

| Criterion | Expected | Observed | Pass |
|---|---|---|---|
| `caughtUp` | `true` | `false` | ❌ |
| cursor near head | within a small lag | cursor 12,870,000 vs head 22,441,069 — lag 9,571,069 blocks (57.4% of head); 9,020,000 blocks short of the 21.89M settlement zone | ❌ |
| `eip3009SettlementCount` | > 0 | 0 — **expected**: sweep has not reached settlement blocks yet | ❌ (blocked by stall, not by a pairing bug) |
| `/api/status` EIP-3009 check ok | ok | `ok: true` | ✅ |
| … with minimal lag | minimal | "backfilling, 9,571,072 blocks behind" | ❌ |

Note: the status check computes `ok` as `cursor > 0`, so it reports healthy even at
9.57M blocks of lag. Treat the detail string, not `ok`, as the signal (or tighten the check).

## 2. Endpoint snapshots (UTC)

| Time | cursor | head | caughtUp | settlements |
|---|---|---|---|---|
| 01:30:36 | 12,870,000 | 22,439,760 | false | 0 |
| ~01:32:00 | 12,870,000 | 22,439,887 | false | 0 |
| ~01:33:15 | 12,870,000 | 22,440,039 | false | 0 |
| 01:38:55 | 12,870,000 | 22,440,748 | false | 0 |
| ~01:41:00 | 12,870,000 | 22,441,069 | false | 0 |

`/api/status` at 01:41Z: Arc RPC ok (head 22,439,764), Marketplace ledger ok,
Settlement (Circle Facilitator) ok, x402 gateway ok, EIP-3009 indexer ok —
"backfilling, 9,571,072 blocks behind".

**Cursor moved 0 blocks in ~10 minutes while the head advanced ~1,300 blocks.**
Cron is `* * * * *` and the cursor is persisted after every 10k-block sub-chunk,
so any live tick would advance it visibly within 1–2 minutes. Zero movement across
~10 ticks = the run dies inside the first sub-chunk, before `writeCursor`.

## 3. Why it is stalled (evidence, not speculation)

Probing the exact next window the indexer would scan (12,870,001–12,880,000) against
`https://rpc.mainnet.arc.io`:

- `AuthorizationUsed` getLogs over the window: OK, 0 logs.
- `Transfer` getLogs over the same window: RPC error `-32602 "request exceeded max
  allowed range: query exceeds max results 20000, retry with the range 12870001-12873946"`.
- Replaying the indexer's own hint-fallback logic against the live RPC: the single
  sub-chunk needs **11 recursive RPC calls** and returns **114,688 Transfer logs**
  (~11.5/block — USDC is Arc's native gas token), ~29 s wall from an external client
  and tens of MB of JSON to parse and hold in one Worker invocation.

Prime suspect: the per-tick run is dying on that first sub-chunk (Worker memory /
subrequest / CPU pressure while fetching and materialising ~115k logs), before
`writeCursor` runs — consistent with the cursor pinned at exactly a sub-chunk
boundary (12,870,000 = 1287 × 10,000). Worker logs would confirm; not visible from here.

Secondary latent bug found while reading `api/lib/indexer.ts#getLogs`: the fallback
matcher only recognises `/retry with the range \d+-(\d+)/` and
`/block range limit exceeded/i`. This RPC's flat range-cap error is
`-32012 "requested range too large"` (observed live on a 20k-block probe) — it matches
**neither** pattern, so if the provider ever rejects a 10k window flatly, `getLogs`
rethrows, the tick dies, and the cursor pins. Add the message (or code -32012) to the matcher.

Supabase ruled out: with RLS and no policies the publishable key reads return `[]` and
writes are denied (`401 / 42501` — verified). The status endpoint shows the real cursor
value, so the Worker reads through the service-role key; writes therefore also work.
Not the stall cause.

### Recommended fix (make the Transfer scan sparse)

Do not scan the full `Transfer` topic over every 10k window. Fetch `AuthorizationUsed`
logs first (sparse: 1,156 events per ~20k blocks ≈ 0.06/block vs ~11.5 Transfers/block),
then fetch Transfers only for blocks/txs that actually have auth events (per-block
getLogs or per-tx receipts for just those txs). This removes the OOM/timeout path
entirely and cuts RPC volume by orders of magnitude while backfilling. Also widen the
fallback matcher to include "requested range too large" / code -32012.

## 4. Pairing & attribution validated on-chain (the asked-for debug, done proactively)

- `keccak256("AuthorizationUsed(address,bytes32)")` =
  `0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5` — matches live
  events: **1,156 AuthorizationUsed logs in blocks 21,880,000–21,900,000**, all 3-topic
  form; 0 logs for the legacy `AuthorizationUsed(bytes32)` form. Settlements do live at
  ~21.89M, as expected.
- Receipt-level pairing check, tx `0x84a61323de9508e5b100892222c64feec9473dc54ca88b88e2cc433ce9fb7385`
  (block 21,880,025, status success):
  - `AuthorizationUsed.topics[1]` (authorizer) = `0xa82d4d438c674ce648310eda417fe9a5c291548b`
    = paired `Transfer.from` ✔
  - `topics[2]` nonce present ✔
  - largest-of-N Transfer heuristic: 1 Transfer in tx, payee
    `0x0f552596503a3909c25fa84496d8d23fe8b0b330`, value 0.00346 USDC ✔
- Attribution join (`attributeHashes`): lowercased `tx_hash` → `payment_ids` →
  `endpoints.slug`; PostgREST `in.(...)` over hex hashes is safe; fails soft without
  dropping on-chain rows. No defect found.
- Minor inconsistency (not a bug today): `verify.ts` accepts both AuthorizationUsed
  topic variants, the indexer scans only the new one — fine while Arc emits only the
  new form (0 legacy logs observed).

## 5. Next verification pass

Re-run this check after the sweep resumes: pass requires `caughtUp=true`,
lag ≈ 0, and `eip3009SettlementCount ≥ ~1,156` (the count already sitting in
21.88M–21.90M alone, plus whatever later blocks hold).

---
*Probe method: live JSON-RPC against `https://rpc.mainnet.arc.io` (eth_getLogs /
eth_getTransactionReceipt / eth_blockNumber), endpoint polls of
`/api/verify/summary` and `/api/status`, Supabase REST RLS probes with the publishable
key, and code review of `api/lib/indexer.ts`, `api/verify.ts`, `api/status.ts`,
`api/worker.ts`, `wrangler.jsonc`, `scripts/indexer.sql` @ commit c1b10f9.*
