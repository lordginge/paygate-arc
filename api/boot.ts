import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { x402Gateway } from "./x402/gateway";
import { dataApi } from "./data";
import { verifyApi } from "./verify";
import { statusApi } from "./status";
import { circleUsersApi } from "./circle/users";
import { onrampSessionHandler } from "./onramp";
import { GUIDE_PARTS } from "./x402/guide";
import { loadDotenv } from "./lib/dotenv-safe";
import { callerKey, rateLimited } from "./lib/rateLimit";

await loadDotenv();

const app = new Hono();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Rate-limit the free, unauthenticated write surface. Paid x402 routes
// stay unlimited (the payment is the throttle). Per-isolate, see
// lib/rateLimit.ts for the trade-off.
app.use("/api/trpc/*", async (c, next) => {
  const { limited, retryAfterSec } = rateLimited(
    callerKey(c.req.raw, "trpc"),
    { limit: 60, windowMs: 60_000 },
  );
  if (limited) {
    return c.json(
      { error: "Rate limit exceeded, retry later" },
      429,
      { "Retry-After": String(retryAfterSec) },
    );
  }
  // Hono middleware MUST return next()'s result. Discarding it (bare
  // `await next()`) leaves the response unset and turns every tRPC call
  // into a 500.
  return await next();
});

// x402 discovery manifest (x402scan registration + IETF draft-hawkins
// well-known URI). Origin is pinned in config, never derived from the
// request Host header.
app.get("/.well-known/x402", (c) => {
  const origin = "https://paygatex402.com";
  return c.json(
    {
      version: 1,
      x402Version: 2,
      kind: "resource-server",
      name: "PayGate x402",
      description:
        "Pay-per-call API marketplace settling in USDC on Arc mainnet (eip155:5042) via EIP-3009 and the Circle facilitator.",
      resources: GUIDE_PARTS.map((p) => `${origin}/api/x402/${p.slug}`),
      docs: `${origin}/docs`,
      updated: "2026-09-24T00:00:00Z",
    },
    200,
    { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  );
});

// OpenAPI discovery document. Read by x402scan's register-origin probe
// (flat x-payment-info per route) and by the Circle Agent Marketplace
// intake (full OpenAPI). The full spec is pregenerated in openapi-spec.json
// from the live 402 challenges of all 20 endpoints (verbs, amounts, payTo,
// categories); the flat x-payment-info shape is derived from it here so
// both consumers get consistent, complete data from one source.
import fullSpec from "./openapi-spec.json";
import a2aCard from "./wellknown-a2a.json";

// Agent discovery surfaces (probed by Circle tooling, a2a clients, and
// x402 registries). openapi.json stays the canonical full spec; the
// .well-known variants are discovery aliases pointing agents at it.
app.get("/.well-known/openapi.json", (c) => c.redirect("https://paygatex402.com/openapi.json", 302));
app.get("/.well-known/ai-plugin.json", (c) =>
  c.json({
    schema_version: "v1",
    name_for_model: "paygate_x402",
    name_for_human: "PayGate x402",
    description_for_model: "Pay-per-call API marketplace on Arc mainnet. 20 x402 v2 endpoints (market data, RWA, web extraction, infrastructure) priced 0.0005-0.02 USDC per call, settled via Circle Facilitator (EIP-3009) on eip155:5042.",
    description_for_human: "Pay per call API marketplace - USDC on Arc.",
    auth: { type: "none" },
    api: { type: "openapi", url: "https://paygatex402.com/openapi.json", has_user_authentication: false },
    logo_url: "https://paygatex402.com/favicon.ico",
    contact_email: "lordginge82@gmail.com",
    legal_info_url: "https://paygatex402.com/legal",
  })
);
app.get("/.well-known/a2a.json", (c) => c.json(a2aCard as Record<string, unknown>));

app.get("/openapi.json", (c) => {
  const spec = fullSpec as Record<string, unknown>;
  const rawPaths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const paths = Object.fromEntries(
    Object.entries(rawPaths).map(([route, ops]) => {
      const op = ((ops.get ?? ops.post) ?? {}) as Record<string, unknown>;
      const x = (op["x-x402"] ?? {}) as Record<string, string>;
      const usd = x.amount ? (Number(x.amount) / 1_000_000).toFixed(6) : "0.000000";
      const withPrice = {
        ...op,
        "x-payment-info": {
          protocols: ["x402"],
          price: { mode: "fixed", currency: "USDC", amount: usd },
        },
      };
      return [route, ops.get ? { get: withPrice } : { post: withPrice }];
    }),
  );
  return c.json(
    { ...spec, paths },
    200,
    { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  );
});

app.route("/api/x402", x402Gateway);
app.route("/api/data", dataApi);
app.route("/api/verify", verifyApi);
app.route("/api/status", statusApi);
app.route("/api/circle", circleUsersApi);
app.post("/api/onramp/sessions", (c) => onrampSessionHandler(c.req.raw));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;
