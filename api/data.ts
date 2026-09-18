// PayGate first-party data endpoints (the marketplace's own catalogue).
// These are the upstream targets the x402 gateway proxies to after a
// successful Arc USDC settle. Free public sources + our dedicated RPCs.

import { Hono } from "hono";
import { toFunctionSelector } from "viem";
import { arcRpc } from "./x402/config";
import { sbInsert } from "./lib/supabase";

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
