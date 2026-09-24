import { keccak256, toBytes } from "viem";
import { arcRpc, USDC_ADDRESS, USDC_DECIMALS } from "../x402/config";
import { sbSelect, sbUpsert } from "./supabase";

// On-chain EIP-3009 indexer for Arc. Scans AuthorizationUsed events on the
// native USDC contract, pairs each with the USDC Transfer in the same
// transaction (fetched via that transaction's receipt, one RPC call per
// settlement), attributes matches against the PayGate payment ledger, and
// stores a resumable cursor. Runs from the Worker cron; everything is
// idempotent (upserts keyed by tx_hash + log_index) so reruns are safe.
//
// Why receipts and not a Transfer getLogs window: dense regions of Arc
// carry 300k+ USDC Transfer logs per 10k blocks (observed 317,857 at
// blocks 21,060,000-21,069,999), which is un-fetchable inside a cron
// subrequest/CPU budget. Settlements are sparse by comparison, and a
// receipt lookup is bounded by settlement count, not transfer volume.
//
// Cron CPU time is the hard constraint, so work is done in sub-chunks and
// the cursor is persisted after every sub-chunk: a killed run never loses
// progress and never double-writes.

const CURSOR_ID = "eip3009-arc";
// Arc RPC (Chainstack) caps eth_getLogs at a 10,000-block range, verified
// live. Stay under it; the halving fallback below covers denser result caps.
const SUBCHUNK = 10_000; // blocks per sub-chunk
const MAX_SUBCHUNKS_PER_RUN = 10; // ~100k blocks per cron tick while backfilling
const TIME_BUDGET_MS = 25_000; // stop before the scheduled-handler CPU limit
const UPSERT_BATCH = 500;
const RECEIPT_BATCH = 25; // receipt lookups per subrequest-budget window
// Arc's USDC emits AuthorizationUsed(address indexed authorizer,
// bytes32 indexed nonce) — verified against live settle transactions
// (e.g. block 21893689). Not the older AuthorizationUsed(bytes32) form.
const AUTHORIZATION_USED_TOPIC = keccak256(
  toBytes("AuthorizationUsed(address,bytes32)"),
);
const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));

type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
  logIndex: string;
};

async function getLogs(
  from: number,
  to: number,
  topic: string,
): Promise<RpcLog[]> {
  try {
    const logs = await arcRpc<RpcLog[] | null>("eth_getLogs", [
      {
        address: USDC_ADDRESS,
        topics: [topic],
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      },
    ]);
    return logs ?? [];
  } catch (e) {
    // Two caps exist: an explicit suggested bound ("retry with the range
    // A-B") and a flat block-range limit ("Block range limit exceeded").
    // Honour the bound if given, otherwise halve; scan both halves either
    // way so no blocks are skipped.
    const msg = String(e);
    const m = msg.match(/retry with the range \d+-(\d+)/);
    const rangeLimited = m || /block range limit exceeded/i.test(msg);
    if (!rangeLimited) throw e;
    const mid = m
      ? Math.min(to, parseInt(m[1], 10))
      : from + Math.floor((to - from) / 2);
    if (mid <= from) return [];
    const first = await getLogs(from, mid, topic);
    if (mid >= to) return first;
    return first.concat(await getLogs(mid + 1, to, topic));
  }
}

async function readCursor(): Promise<number> {
  try {
    const rows = await sbSelect<{ last_block: number }>(
      "indexer_cursor",
      `id=eq.${CURSOR_ID}&select=last_block`,
    );
    return rows[0]?.last_block ?? 0;
  } catch {
    return 0;
  }
}

async function writeCursor(last: number): Promise<void> {
  await sbUpsert("indexer_cursor", { id: CURSOR_ID, last_block: last }, "id");
}

// Largest USDC Transfer per transaction hash for a block window.
function largestTransfersByTx(transferLogs: RpcLog[]): Map<string, RpcLog> {
  const byTx = new Map<string, RpcLog>();
  for (const l of transferLogs) {
    const cur = byTx.get(l.transactionHash);
    if (!cur || BigInt(l.data) > BigInt(cur.data)) byTx.set(l.transactionHash, l);
  }
  return byTx;
}

// Batch attribution: tx_hash -> endpoint slug for hashes present in the
// payment ledger. Fails soft to empty map.
async function attributeHashes(
  hashes: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (hashes.length === 0) return out;
  try {
    const ledger = await sbSelect<{ tx_hash: string; endpoint_id: string }>(
      "payment_ids",
      `tx_hash=in.(${hashes.join(",")})&select=tx_hash,endpoint_id`,
    );
    if (ledger.length === 0) return out;
    const epIds = [...new Set(ledger.map((r) => r.endpoint_id))];
    const eps = await sbSelect<{ id: string; slug: string }>(
      "endpoints",
      `id=in.(${epIds.join(",")})&select=id,slug`,
    );
    const slugById = new Map(eps.map((e) => [e.id, e.slug]));
    for (const r of ledger) {
      out.set(r.tx_hash, slugById.get(r.endpoint_id) ?? null);
    }
  } catch {
    // attribution fails soft; on-chain rows still land
  }
  return out;
}

export async function advanceIndexer(): Promise<{
  from: number;
  to: number;
  events: number;
  caughtUp: boolean;
}> {
  const started = Date.now();
  const headHex = await arcRpc<string>("eth_blockNumber", []);
  const head = Number(BigInt(headHex));
  let last = await readCursor();
  const runFrom = last + 1;
  let events = 0;

  for (let i = 0; i < MAX_SUBCHUNKS_PER_RUN; i++) {
    const from = last + 1;
    if (from > head) break;
    const to = Math.min(head, last + SUBCHUNK);

    // AuthorizationUsed is the sparse signal (dozens per 10k blocks even in
    // active regions). Transfer logs are 100x denser and their JSON parse
    // burns the cron CPU budget, so only fetch them when the sub-chunk
    // actually contains settlements to pair.
    const authLogs = await getLogs(from, to, AUTHORIZATION_USED_TOPIC);

    if (authLogs.length > 0) {
      // Pair each settlement with the USDC Transfer in the same tx via the
      // tx receipt (one call per settlement tx). A Transfer getLogs window
      // is not viable: dense regions exceed 300k logs per sub-chunk.
      const txHashes = [...new Set(authLogs.map((l) => l.transactionHash))];
      // Batched, not Promise.all: cron subrequest budget is the hard cap and
      // an unbounded fan-out would exceed it in active regions.
      const receipts: ({ logs: RpcLog[] } | null)[] = [];
      for (let b = 0; b < txHashes.length; b += RECEIPT_BATCH) {
        receipts.push(
          ...(await Promise.all(
            txHashes
              .slice(b, b + RECEIPT_BATCH)
              .map((h) =>
                arcRpc<{ logs: RpcLog[] } | null>("eth_getTransactionReceipt", [
                  h,
                ]),
              )),
          )),
        );
      }
      const transferLogs: RpcLog[] = [];
      for (const rc of receipts) {
        for (const l of rc?.logs ?? []) {
          if (
            l.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
            l.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase()
          ) {
            transferLogs.push(l);
          }
        }
      }
      const transferByTx = largestTransfersByTx(transferLogs);
      const hashes = txHashes.map((h) => h.toLowerCase());
      const slugByTx = await attributeHashes(hashes);

      const rows = authLogs.map((log) => {
        const main = transferByTx.get(log.transactionHash);
        return {
          tx_hash: log.transactionHash.toLowerCase(),
          log_index: Number(BigInt(log.logIndex)),
          block_number: Number(BigInt(log.blockNumber)),
          nonce: log.topics[2],
          // Authorizer (payer) is topic1 of AuthorizationUsed; the paired
          // Transfer supplies payee and amount.
          payer: `0x${log.topics[1].slice(26).toLowerCase()}`,
          payee: main ? `0x${main.topics[2].slice(26).toLowerCase()}` : null,
          value_usdc: main ? Number(BigInt(main.data)) / 10 ** USDC_DECIMALS : null,
          endpoint_slug: slugByTx.get(log.transactionHash.toLowerCase()) ?? null,
          attributed: slugByTx.has(log.transactionHash.toLowerCase()),
        };
      });

      for (let b = 0; b < rows.length; b += UPSERT_BATCH) {
        await sbUpsert(
          "eip3009_events",
          rows.slice(b, b + UPSERT_BATCH),
          "tx_hash,log_index",
        );
      }
      events += authLogs.length;
    }

    await writeCursor(to);
    last = to;

    if (to >= head || Date.now() - started > TIME_BUDGET_MS) break;
  }

  return { from: runFrom, to: last, events, caughtUp: last >= head };
}

export async function indexerState(): Promise<{
  cursor: number;
  head: number;
}> {
  const headHex = await arcRpc<string>("eth_blockNumber", []);
  return { cursor: await readCursor(), head: Number(BigInt(headHex)) };
}
