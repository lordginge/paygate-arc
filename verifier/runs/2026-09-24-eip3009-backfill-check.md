# EIP-3009 Indexer Backfill — Verification Run

- **Date:** 2026-09-24 ~19:10–19:13 UTC
- **Target:** https://paygatex402.com
- **Verifier:** automated run via agent

## Endpoints polled

### GET /api/verify/summary (3 polls over ~4 min, values stable)

```json
{
  "chain": "eip155:5042",
  "usdc": "0x3600000000000000000000000000000000000000",
  "eip3009SettlementCount": 1000,
  "eip3009VolumeUsdc": 637735.61008,
  "uniquePayers": 804,
  "cursor": 21060000,
  "head": 22565288,
  "caughtUp": false
}
```

### GET /api/status (generatedAt 2026-09-24T19:12:59Z)

| Check | ok | Detail |
|---|---|---|
| Arc RPC | true | reachable, head block 22,565,290 |
| Marketplace ledger | true | Supabase reachable |
| Settlement (Circle Facilitator) | true | configured |
| x402 gateway | true | challenge routes live |
| EIP-3009 indexer | true | backfilling, 1,505,290 blocks behind |

## Pass criteria vs observed

| Criterion | Expected | Observed | Result |
|---|---|---|---|
| caughtUp | true | false | FAIL |
| cursor near head | near head | 21,060,000 vs head 22,565,288 (~1.505M behind) | FAIL |
| sweep past ~21.89M active zone | cursor > 21.89M | cursor 21.06M (~830k short) | FAIL |
| eip3009SettlementCount | > 1000 | exactly 1000 | NOT CONFIRMED |
| /api/status indexer check | ok | ok: true | PASS (detail: backfilling) |

## Outcome

**Backfill is still in progress — completion NOT verified.**

- Cursor remained static at 21,060,000 across the full ~4-minute observation window while chain head advanced (22,564,992 → 22,565,290). Either the indexer commits the cursor in infrequent batches, or the worker is stalled — check indexer logs.
- `eip3009SettlementCount` sits at exactly 1,000 across all polls, which suggests a LIMIT/cap on the summary query rather than a true total; re-check after caughtUp flips true.
- Volume indexed to cursor so far: 637,735.61 USDC across 804 unique payers.

## Next steps

1. Check indexer worker logs for stall vs batch-commit behaviour.
2. Re-run this verification once cursor advances past ~21.89M and caughtUp = true.
3. Confirm settlement count exceeds 1,000 (or remove the query cap) before claiming the full sweep in the DoraHacks submission.
