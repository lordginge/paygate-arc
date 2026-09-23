import { Hono } from "hono";
import { arcRpc, x402Configured } from "./x402/config";
import { sbSelect } from "./lib/supabase";
import { indexerState } from "./lib/indexer";

// Public status endpoint. Read-only checks against the real dependencies
// (Arc RPC, Supabase, facilitator configuration). Cached briefly so the
// status page does not hammer the RPC on every visitor.

const TTL_MS = 30_000;
let cache: { at: number; body: unknown } | null = null;

export const statusApi = new Hono();

statusApi.get("/", async (c) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return c.json(cache.body);
  }

  const checks: {
    name: string;
    ok: boolean;
    detail: string;
  }[] = [];

  // Arc RPC reachability and head block.
  try {
    const hex = await arcRpc<string>("eth_blockNumber", []);
    checks.push({
      name: "Arc RPC",
      ok: true,
      detail: `reachable, head block ${Number(BigInt(hex)).toLocaleString()}`,
    });
  } catch (e) {
    checks.push({ name: "Arc RPC", ok: false, detail: (e as Error).message });
  }

  // Supabase / marketplace ledger.
  try {
    await sbSelect("endpoints", "select=id&limit=1");
    checks.push({ name: "Marketplace ledger", ok: true, detail: "Supabase reachable" });
  } catch (e) {
    checks.push({
      name: "Marketplace ledger",
      ok: false,
      detail: (e as Error).message,
    });
  }

  // Facilitator configuration (Circle hosted facilitator).
  const cfg = x402Configured();
  checks.push({
    name: "Settlement (Circle Facilitator)",
    ok: cfg.missing.length === 0,
    detail:
      cfg.missing.length === 0
        ? "configured"
        : `missing: ${cfg.missing.join(", ")}`,
  });

  // Gateway liveness is verified externally by the status page itself:
  // it fetches a known paid route and expects a 402 challenge.
  checks.push({
    name: "x402 gateway",
    ok: true,
    detail: "challenge routes live (see page-level probe)",
  });

  // On-chain indexer lag: how far the EIP-3009 sweep sits behind the head.
  try {
    const state = await indexerState();
    const lag = Math.max(0, state.head - state.cursor);
    checks.push({
      name: "EIP-3009 indexer",
      ok: state.cursor > 0,
      detail:
        lag === 0
          ? "caught up to head"
          : `backfilling, ${lag.toLocaleString()} blocks behind`,
    });
  } catch (e) {
    checks.push({ name: "EIP-3009 indexer", ok: false, detail: (e as Error).message });
  }

  const body = {
    generatedAt: new Date().toISOString(),
    checks,
  };
  cache = { at: Date.now(), body };
  return c.json(body);
});
