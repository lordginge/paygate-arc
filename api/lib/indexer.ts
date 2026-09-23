import { keccak256, toBytes } from "viem";
import { arcRpc, USDC_ADDRESS, USDC_DECIMALS } from "../x402/config";
import { sbSelect, sbUpsert } from "./supabase";

// On-chain EIP-3009 indexer for Arc. Scans AuthorizationUsed events on the
// native USDC contract, pairs each with the USDC Transfer in the same
// transaction, attributes matches against the PayGate payment ledger, and
// stores a resumable cursor. Runs from the Worker cron; everything is
// idempotent (upserts keyed by tx_hash + log_index) so reruns are safe.

const CURSOR_ID = "eip3009-arc";
const CHUNK = 200_000; // blocks per run while catching up
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

type RpcReceipt = {
  transactionHash: string;
  logs: RpcLog[];
};

async function getLogs(from: number, to: number): Promise<RpcLog[]> {
  try {
    const logs = await arcRpc<RpcLog[] | null>("eth_getLogs", [
      {
        address: USDC_ADDRESS,
        topics: [AUTHORIZATION_USED_TOPIC],
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      },
    ]);
    return logs ?? [];
  } catch (e) {
    // Arc caps eth_getLogs by result count; honour the suggested bound.
    const m = String(e).match(/retry with the range \d+-(\d+)/);
    if (!m) throw e;
    const clampTo = Math.min(to, parseInt(m[1], 10));
    if (clampTo <= from) return [];
    return getLogs(from, clampTo);
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

export async function advanceIndexer(): Promise<{
  from: number;
  to: number;
  events: number;
  caughtUp: boolean;
}> {
  const headHex = await arcRpc<string>("eth_blockNumber", []);
  const head = Number(BigInt(headHex));
  const last = await readCursor();
  const from = last + 1;
  const to = Math.min(head, last + CHUNK);
  if (from > head) {
    return { from, to: head, events: 0, caughtUp: true };
  }

  const authLogs = await getLogs(from, to);

  for (const log of authLogs) {
    const receipt = await arcRpc<RpcReceipt | null>(
      "eth_getTransactionReceipt",
      [log.transactionHash],
    ).catch(() => null);
    if (!receipt) continue;

    const transfers = receipt.logs.filter(
      (l) =>
        l.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
        l.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase(),
    );
    // The settlement transfer is the largest USDC movement in the tx
    // (facilitator and fee legs, if any, are smaller or absent).
    const main = transfers.sort(
      (a, b) => Number(BigInt(b.data) - BigInt(a.data)),
    )[0];

    // Authorizer (payer) is topic1 of the AuthorizationUsed event itself;
    // the Transfer pairing supplies payee and amount.
    const payer = `0x${log.topics[1].slice(26).toLowerCase()}`;
    const payee = main ? `0x${main.topics[2].slice(26).toLowerCase()}` : null;
    const valueUsdc = main
      ? Number(BigInt(main.data)) / 10 ** USDC_DECIMALS
      : null;

    // Attribution: match against the payment ledger by tx hash.
    let slug: string | null = null;
    let attributed = false;
    try {
      const ledger = await sbSelect<{ endpoint_id: string }>(
        "payment_ids",
        `tx_hash=eq.${log.transactionHash.toLowerCase()}&select=endpoint_id&limit=1`,
      );
      if (ledger[0]) {
        const eps = await sbSelect<{ id: string; slug: string }>(
          "endpoints",
          `id=eq.${ledger[0].endpoint_id}&select=id,slug`,
        );
        slug = eps[0]?.slug ?? null;
        attributed = true;
      }
    } catch {
      // attribution fails soft; the on-chain row still lands
    }

    await sbUpsert(
      "eip3009_events",
      {
        tx_hash: log.transactionHash.toLowerCase(),
        log_index: Number(BigInt(log.logIndex)),
        block_number: Number(BigInt(log.blockNumber)),
        nonce: log.topics[2],
        payer,
        payee,
        value_usdc: valueUsdc,
        endpoint_slug: slug,
        attributed,
      },
      "tx_hash,log_index",
    );
  }

  await writeCursor(to);
  return { from, to, events: authLogs.length, caughtUp: to >= head };
}

export async function indexerState(): Promise<{
  cursor: number;
  head: number;
}> {
  const headHex = await arcRpc<string>("eth_blockNumber", []);
  return { cursor: await readCursor(), head: Number(BigInt(headHex)) };
}
