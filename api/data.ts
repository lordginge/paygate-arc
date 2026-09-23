// PayGate first-party data endpoints (the marketplace's own catalogue).
// These are the upstream targets the x402 gateway proxies to after a
// successful Arc USDC settle. Free public sources + our dedicated RPCs.

import { Hono } from "hono";
import { toFunctionSelector } from "viem";
import { arcRpc } from "./x402/config";
import { sbInsert, sbSelect } from "./lib/supabase";

const SPOKE = "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d";

async function binance(path: string): Promise<unknown> {
  // Multi-source failover: Workers egress reaches all of these; some
  // environments block individual providers.
  const bases = [
    "https://api.binance.com",
    "https://api.binance.us",
    "https://api1.binance.com",
  ];
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": "PayGate/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all market data sources failed");
}

function normSymbol(s: string): string {
  const up = s.toUpperCase();
  return up.endsWith("USDT") ? up : `${up}USDT`;
}

export const dataApi = new Hono();

// 24h ticker stats (port of PerCall /ticker/:symbol, settled on Arc)
dataApi.get("/ticker/:symbol", async (c) => {
  try {
    const d = (await binance(
      `/api/v3/ticker/24hr?symbol=${normSymbol(c.req.param("symbol"))}`,
    )) as Record<string, string>;
    return c.json({
      symbol: d.symbol,
      lastPrice: d.lastPrice,
      priceChangePct: d.priceChangePercent,
      high24h: d.highPrice,
      low24h: d.lowPrice,
      volume24h: d.volume,
      quoteVolume24h: d.quoteVolume,
      trades24h: d.count,
      source: "binance-spot",
    });
  } catch (e) {
    return c.json({ error: "upstream unavailable", detail: String(e) }, 502);
  }
});

// Order book depth (port of PerCall /depth/:symbol)
dataApi.get("/depth/:symbol", async (c) => {
  try {
    const d = (await binance(
      `/api/v3/depth?symbol=${normSymbol(c.req.param("symbol"))}&limit=20`,
    )) as { bids: [string, string][]; asks: [string, string][] };
    return c.json({
      symbol: normSymbol(c.req.param("symbol")),
      bids: d.bids,
      asks: d.asks,
      levels: 20,
      source: "binance-spot",
    });
  } catch (e) {
    return c.json({ error: "upstream unavailable", detail: String(e) }, 502);
  }
});

// Momentum signal (port of PerCall /signals/momentum):
// 24h and 7d return from hourly klines, plus realised vol.
dataApi.get("/signals/momentum/:symbol", async (c) => {
  try {
    const klines = (await binance(
      `/api/v3/klines?symbol=${normSymbol(c.req.param("symbol"))}&interval=1h&limit=168`,
    )) as [number, string, string, string, string, string][];
    const closes = klines.map((k) => Number(k[4]));
    const last = closes[closes.length - 1];
    const r24 = last / closes[closes.length - 25] - 1;
    const r7d = last / closes[0] - 1;
    const rets = closes.slice(1).map((p, i) => Math.log(p / closes[i]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol =
      Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) *
      Math.sqrt(24 * 365);
    return c.json({
      symbol: normSymbol(c.req.param("symbol")),
      last,
      return24h: r24,
      return7d: r7d,
      annualisedVol: vol,
      signal: r24 > 0.005 && r7d > 0 ? "bullish" : r24 < -0.005 && r7d < 0 ? "bearish" : "neutral",
      source: "binance-spot-1h-klines",
    });
  } catch (e) {
    return c.json({ error: "upstream unavailable", detail: String(e) }, 502);
  }
});

// Paid endpoint requests (upstream of the "request-endpoint" marketplace
// listing). Only reachable after a successful Arc USDC settle; the gateway
// forwards payer + tx headers. Params arrive as query strings.
dataApi.all("/submit-request", async (c) => {
  const payer = c.req.header("x-payer-address") ?? "unknown";
  const txHash = c.req.header("x-payment-tx") ?? null;
  const q = c.req.query();
  const title = (q.title ?? "").slice(0, 120).trim();
  const description = (q.description ?? "").slice(0, 500).trim();
  const category = (q.category ?? "general").slice(0, 40).trim();
  const maxPrice = q.max_price ? Number(q.max_price) : null;
  if (!title || !description) {
    return c.json(
      { error: "title and description query params are required" },
      400,
    );
  }
  if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice <= 0)) {
    return c.json({ error: "max_price must be a positive number" }, 400);
  }
  const rows = await sbInsert("endpoint_requests", {
    requester_address: payer,
    title,
    description,
    category,
    max_price_usdc: maxPrice,
    paid_tx_hash: txHash,
  }).catch((e) => {
    console.error("request insert failed:", e);
    return null;
  });
  if (!rows) return c.json({ error: "could not record request" }, 500);
  return c.json({
    recorded: true,
    request: rows[0],
    note: "Your payment is evidence of demand. Builders can claim open requests.",
  });
});

// Stamp hook diagnostics: reveals only whether the runtime can see the
// signing key, never the key itself. Used to verify deployments.
dataApi.get("/arc/stamp-status", async (c) => {
  const { stampConfigured, STAMP_CONTRACT } = await import("./x402/stamp");
  return c.json({
    configured: stampConfigured(),
    contract: STAMP_CONTRACT,
    chainId: 5042,
  });
});

// General paid Arc JSON-RPC proxy. Upstream of the arc-rpc x402 endpoint:
// one paid surface for ANY read-only Arc query, served over our dedicated
// Chainstack node (with failover). Read-only allowlist keeps us a data
// service, not an anonymous transaction relayer.
const ARC_RPC_ALLOWED_METHODS = new Set([
  "eth_blockNumber",
  "eth_gasPrice",
  "eth_chainId",
  "net_version",
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getUncleCountByBlockNumber",
  "eth_getUncleCountByBlockHash",
  "eth_getLogs",
  "eth_syncing",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
]);

dataApi.post("/arc/rpc", async (c) => {
  let body: { method?: string; params?: unknown[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "body must be JSON-RPC: {method, params}" }, 400);
  }
  const method = body.method;
  if (typeof method !== "string" || !ARC_RPC_ALLOWED_METHODS.has(method)) {
    return c.json(
      {
        error: "method not allowed",
        method,
        allowed: [...ARC_RPC_ALLOWED_METHODS],
      },
      403,
    );
  }
  const params = Array.isArray(body.params) ? body.params : [];
  // Cap fan-out cost: logs queries must be bounded.
  if (method === "eth_getLogs") {
    const filter = (params[0] ?? {}) as { fromBlock?: string; toBlock?: string };
    if (!filter.fromBlock && !filter.toBlock) {
      return c.json(
        { error: "eth_getLogs requires fromBlock/toBlock bounds" },
        400,
      );
    }
  }
  try {
    const result = await arcRpc<unknown>(method, params);
    return c.json({ jsonrpc: "2.0", id: 1, result });
  } catch (e) {
    return c.json({ error: "rpc unavailable", detail: String(e) }, 502);
  }
});

// Arc chain status, served over our dedicated Chainstack node.
dataApi.get("/arc/status", async (c) => {
  try {
    const [blockHex, gasHex] = await Promise.all([
      arcRpc<string>("eth_blockNumber", []),
      arcRpc<string>("eth_gasPrice", []),
    ]);
    return c.json({
      chainId: 5042,
      network: "arc-mainnet",
      blockNumber: parseInt(blockHex, 16),
      gasPriceWei: parseInt(gasHex, 16),
      rpc: "chainstack-dedicated",
    });
  } catch (e) {
    return c.json({ error: "rpc unavailable", detail: String(e) }, 502);
  }
});

// Aave V4 Arc USDC credit state (seed of the PayGate rate map).
dataApi.get("/aave/rates", async (c) => {
  try {
    const suppliedSel = toFunctionSelector("getReserveSuppliedAssets(uint256)");
    const param = "0".repeat(63) + "0"; // reserveId = 0 (USDC)
    const suppliedHex = await arcRpc<string>("eth_call", [
      { to: SPOKE, data: suppliedSel + param },
      "latest",
    ]);
    const supplied = Number(BigInt(suppliedHex)) / 1e6;
    return c.json({
      hub: "0x17288dfc86205301064577b98B02b81017e6F79C",
      spoke: SPOKE,
      asset: "USDC",
      reserveId: 0,
      totalSuppliedUsd: supplied,
      observedBorrowedUsd: 107700, // last manual observation 18 Sep 2026
      source: "arc-mainnet-eth_call",
    });
  } catch (e) {
    return c.json({ error: "rpc unavailable", detail: String(e) }, 502);
  }
});


// Trial credit balance for a wallet (public: balances reveal nothing beyond
// what the wallet owner already knows).
dataApi.get("/trial/balance/:wallet", async (c) => {
  const wallet = c.req.param("wallet").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return c.json({ error: "invalid wallet address" }, 400);
  }
  const rows = await sbSelect<{
    credits_total: number;
    credits_used: number;
    expires_at: string;
  }>(
    "trial_vouchers",
    `wallet_address=eq.${wallet}&select=credits_total,credits_used,expires_at`,
  );
  const v = rows[0];
  if (!v) return c.json({ claimed: false, balance_usdc: 0 });
  const expired = new Date(v.expires_at).getTime() < Date.now();
  return c.json({
    claimed: true,
    expired,
    expires_at: v.expires_at,
    balance_usdc: expired ? 0 : Number(v.credits_total) - Number(v.credits_used),
  });
});

// Real-time USDC transfer feed, read straight off Arc (no database).
// The terminal polls this with ?after=<last block seen> and renders rows.
const USDC = "0x3600000000000000000000000000000000000000";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TREASURY = "0x57607f9296385571CbD8Df14D8728B7CB839743D";

interface RpcLog {
  blockNumber: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

dataApi.get("/arc/usdc-feed", async (c) => {
  try {
    const after = Number(c.req.query("after") ?? "0");
    const latestHex = await arcRpc<string>("eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const fetchRange = (from: number, to: number) =>
      arcRpc<RpcLog[]>("eth_getLogs", [
        {
          address: USDC,
          topics: [TRANSFER_TOPIC],
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + to.toString(16),
        },
      ]);
    // Arc caps eth_getLogs at 10k blocks AND 20k results. Busy ranges
    // fail with "retry with the range A-B"; honour the suggested bound
    // instead of treating the error as an empty result.
    const fetchSafe = async (from: number, to: number): Promise<RpcLog[]> => {
      try {
        return (await fetchRange(from, to)) ?? [];
      } catch (e) {
        const m = String(e).match(/retry with the range \d+-(\d+)/);
        if (!m) throw e;
        const clampTo = Math.min(to, parseInt(m[1], 10));
        if (clampTo <= from) return [];
        return (await fetchRange(from, clampTo)) ?? [];
      }
    };
    let logs: RpcLog[] = [];
    if (after > 0) {
      // Incremental poll: cap the lookback so a long idle gap can't
      // blow the result cap; the terminal is a live view, not an archive.
      const from = Math.max(after + 1, latest - 1999);
      if (from <= latest) logs = await fetchSafe(from, latest);
    } else {
      // First load: walk backwards until we have rows to show.
      let hi = latest;
      for (let i = 0; i < 40 && logs.length < 25 && hi > 0; i++) {
        const lo = Math.max(0, hi - 1999);
        const chunk = await fetchSafe(lo, hi);
        logs = chunk.concat(logs);
        hi = lo - 1;
      }
    }
    const rows = (logs ?? [])
      .filter((l) => l.topics.length >= 3)
      .map((l) => {
        const fromAddr = "0x" + l.topics[1].slice(26).toLowerCase();
        const toAddr = "0x" + l.topics[2].slice(26).toLowerCase();
        return {
          block: parseInt(l.blockNumber, 16),
          tx: l.transactionHash,
          from: fromAddr,
          to: toAddr,
          usdc: Number(BigInt(l.data)) / 1e6,
          paygate: fromAddr === TREASURY || toAddr === TREASURY,
        };
      })
      .sort((a, b) => a.block - b.block)
      .slice(-25);
    return c.json({ latest, rows });
  } catch (e) {
    return c.json({ error: "rpc unavailable", detail: String(e) }, 502);
  }
});

// The 8-part builder guide: build your own x402 resource server on Arc,
// wallet, stamping, and all. Each part is its own paid marketplace endpoint,
// so reading the guide dogfoods the protocol it teaches.
dataApi.get("/guide/:part", async (c) => {
  const part = Number(c.req.param("part"));
  const { getGuidePart, GUIDE_PARTS } = await import("./x402/guide");
  const entry = getGuidePart(part);
  if (!entry) {
    return c.json(
      {
        error: "unknown guide part",
        parts: GUIDE_PARTS.map((p) => ({
          part: p.part,
          slug: p.slug,
          title: p.title,
        })),
      },
      404,
    );
  }
  return c.json({
    part: entry.part,
    slug: entry.slug,
    title: entry.title,
    format: "markdown",
    body: entry.body,
    total_parts: GUIDE_PARTS.length,
  });
});
