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
    const symbol = normSymbol(c.req.param("symbol"));
    const d = (await binance(`/api/v3/ticker/24hr?symbol=${symbol}`)) as Record<string, string>;
    return c.json({
      symbol: d.symbol,
      lastPrice: d.lastPrice,
      priceChangePct: d.priceChangePercent,
      high24h: d.highPrice,
      low24h: d.lowPrice,
      volume24h: d.volume,
      quoteVolume24h: d.quoteVolume,
      trades24h: d.count,
    });
  } catch (e) {
    return c.json({ error: "market data unavailable", detail: String(e) }, 502);
  }
});

// Order book depth snapshot (port of PerCall /depth/:symbol)
dataApi.get("/depth/:symbol", async (c) => {
  try {
    const symbol = normSymbol(c.req.param("symbol"));
    const d = (await binance(`/api/v3/depth?symbol=${symbol}&limit=10`)) as {
      bids: [string, string][];
      asks: [string, string][];
    };
    return c.json({
      symbol,
      bids: d.bids,
      asks: d.asks,
      bestBid: d.bids[0]?.[0] ?? null,
      bestAsk: d.asks[0]?.[0] ?? null,
      spread: d.bids[0] && d.asks[0] ? (Number(d.asks[0][0]) - Number(d.bids[0][0])).toFixed(2) : null,
    });
  } catch (e) {
    return c.json({ error: "market data unavailable", detail: String(e) }, 502);
  }
});

// Simple momentum signal derived from recent klines (port of PerCall
// /signals/momentum/:symbol).
dataApi.get("/signals/momentum/:symbol", async (c) => {
  try {
    const symbol = normSymbol(c.req.param("symbol"));
    const klines = (await binance(`/api/v3/klines?symbol=${symbol}&interval=1h&limit=24`)) as unknown[][];
    const closes = klines.map((k) => Number(k[4]));
    const first = closes[0];
    const last = closes[closes.length - 1];
    const pct = ((last - first) / first) * 100;
    const signal = pct > 1 ? "bullish" : pct < -1 ? "bearish" : "neutral";
    return c.json({
      symbol,
      windowHours: 24,
      firstClose: first,
      lastClose: last,
      changePct: pct.toFixed(3),
      signal,
    });
  } catch (e) {
    return c.json({ error: "market data unavailable", detail: String(e) }, 502);
  }
});

// Paid endpoint-request channel: agents pay the settle, then POST what they
// want listed. Requests land in Supabase for review.
dataApi.all("/submit-request", async (c) => {
  let body: { title?: string; description?: string; upstream_hint?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // allow empty; query params also accepted
  }
  const url = new URL(c.req.url);
  const title = body.title ?? url.searchParams.get("title") ?? "";
  const description = body.description ?? url.searchParams.get("description") ?? "";
  const hint = body.upstream_hint ?? url.searchParams.get("upstream") ?? "";
  if (!title) return c.json({ error: "title required (JSON body or ?title=)" }, 400);

  const rows = await sbInsert("endpoint_requests", {
    title: String(title).slice(0, 120),
    description: String(description).slice(0, 1000),
    upstream_hint: String(hint).slice(0, 300),
    payer_address: c.req.header("x-payer-address") ?? "unknown",
    tx_hash: c.req.header("x-payment-tx") ?? null,
  });
  return c.json({
    received: true,
    request: rows[0],
    note: "Requested endpoints are reviewed and, if viable, listed on the marketplace.",
  });
});

// Live Arc chain status via the dedicated Chainstack node.
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
