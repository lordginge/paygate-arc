import { Hono } from "hono";
import { keccak256, toBytes } from "viem";
import { arcRpc, USDC_ADDRESS, USDC_DECIMALS, ARC_EXPLORER } from "./x402/config";
import { sbSelect } from "./lib/supabase";

// Public, read-only payment verification. Anyone can paste an Arc tx hash
// and see the on-chain USDC transfer, whether it was an EIP-3009
// settlement, and the gateway receipt that matches it. Nothing here is
// self-reported: chain data comes from Arc RPC, receipt data from the
// gateway ledger.

const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const AUTHORIZATION_USED_TOPIC = keccak256(
  toBytes("AuthorizationUsed(bytes32)"),
);

type RpcLog = {
  address: string;
  topics: string[];
  data: string;
};

type RpcReceipt = {
  transactionHash: string;
  blockNumber: string;
  status: string;
  logs: RpcLog[];
};

function topicToAddress(topic: string): string {
  return `0x${topic.slice(26).toLowerCase()}`;
}

function decodeTransfer(log: RpcLog) {
  return {
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    valueUsdc: Number(BigInt(log.data)) / 10 ** USDC_DECIMALS,
  };
}

export const verifyApi = new Hono();

// Recent settled fills that carry an on-chain tx hash. Powers the
// "recent verified fills" list on the verify page. Fails soft: an
// unprovisioned payment_ids table yields an empty list, never an error.
verifyApi.get("/recent", async (c) => {
  try {
    const rows = await sbSelect<{
      id: string;
      tx_hash: string | null;
      payer_address: string;
      endpoint_id: string;
    }>(
      "payment_ids",
      "tx_hash=not.is.null&select=id,tx_hash,payer_address,endpoint_id&limit=10",
    ).catch(() => [] as { id: string; tx_hash: string | null; payer_address: string; endpoint_id: string }[]);

    const endpointIds = [...new Set(rows.map((r) => r.endpoint_id))].join(",");
    const endpoints = endpointIds
      ? await sbSelect<{ id: string; slug: string }>(
          "endpoints",
          `id=in.(${endpointIds})&select=id,slug`,
        ).catch(() => [] as { id: string; slug: string }[])
      : [];
    const slugById = new Map(endpoints.map((e) => [e.id, e.slug]));

    return c.json({
      fills: rows.map((r) => ({
        id: r.id,
        txHash: r.tx_hash,
        payer: r.payer_address,
        slug: slugById.get(r.endpoint_id) ?? null,
        explorerUrl: r.tx_hash ? `${ARC_EXPLORER}/tx/${r.tx_hash}` : null,
      })),
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

verifyApi.get("/tx/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return c.json({ error: "Invalid transaction hash" }, 400);
  }

  const receipt = await arcRpc<RpcReceipt | null>(
    "eth_getTransactionReceipt",
    [hash],
  ).catch(() => null);

  if (!receipt) {
    return c.json({ error: "Transaction not found on Arc" }, 404);
  }

  const usdcLogs = receipt.logs.filter(
    (l) => l.address.toLowerCase() === USDC_ADDRESS.toLowerCase(),
  );
  const transfers = usdcLogs
    .filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase())
    .map(decodeTransfer);
  const eip3009 = usdcLogs.some(
    (l) => l.topics[0]?.toLowerCase() === AUTHORIZATION_USED_TOPIC.toLowerCase(),
  );

  // Gateway receipt: match this tx against the payment ledger. Missing
  // table or no match both yield matched:false plus ledger state, so the
  // page can say honestly what it could and could not corroborate.
  let ledger:
    | { state: "unavailable" | "no-match" | "matched"; receipt?: unknown }
    | undefined;
  try {
    const rows = await sbSelect<{
      id: string;
      payer_address: string;
      endpoint_id: string;
    }>(
      "payment_ids",
      `tx_hash=eq.${hash.toLowerCase()}&select=id,payer_address,endpoint_id`,
    );
    if (rows.length === 0) {
      ledger = { state: "no-match" };
    } else {
      const endpoints = await sbSelect<{ id: string; slug: string }>(
        "endpoints",
        `id=in.(${rows.map((r) => r.endpoint_id).join(",")})&select=id,slug`,
      ).catch(() => [] as { id: string; slug: string }[]);
      const slugById = new Map(endpoints.map((e) => [e.id, e.slug]));
      ledger = {
        state: "matched",
        receipt: rows.map((r) => ({
          paymentId: r.id,
          payer: r.payer_address,
          slug: slugById.get(r.endpoint_id) ?? null,
        })),
      };
    }
  } catch {
    ledger = { state: "unavailable" };
  }

  return c.json({
    txHash: receipt.transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    status: receipt.status === "0x1" ? "success" : "failed",
    eip3009Settlement: eip3009,
    usdcTransfers: transfers,
    ledger,
    explorerUrl: `${ARC_EXPLORER}/tx/${receipt.transactionHash}`,
  });
});
