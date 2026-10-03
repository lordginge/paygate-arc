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

// OpenAPI discovery document. This is the primary channel x402scan's
// register-origin probe reads (its @agentcash/discovery version is
// OpenAPI-only), so the paid routes are declared here with flat
// x-payment-info pricing, which is the shape that validator accepts.
app.get("/openapi.json", (c) => {
  const paths = Object.fromEntries(
    GUIDE_PARTS.map((p) => [
      `/api/x402/${p.slug}`,
      {
        get: {
          summary: p.title,
          description:
            "Paid x402 resource. Returns 402 with a payment challenge; pay 0.01 USDC on Arc mainnet (EIP-3009) to receive this guide part.",
          responses: {
            "200": { description: "Guide part content (paid)" },
            "402": { description: "Payment required" },
          },
          "x-payment-info": {
            protocols: ["x402"],
            pricingMode: "fixed",
            price: "0.01",
            currency: "USD",
          },
        },
      },
    ]),
  );
  return c.json(
    {
      openapi: "3.1.0",
      info: {
        title: "PayGate x402",
        version: "1.0.0",
        description:
          "Pay-per-call API marketplace settling in USDC on Arc mainnet (eip155:5042) via EIP-3009 and the Circle facilitator.",
        contact: { url: "https://paygatex402.com/docs" },
      },
      paths,
    },
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
