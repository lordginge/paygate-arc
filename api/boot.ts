import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { x402Gateway } from "./x402/gateway";
import { dataApi } from "./data";
import { verifyApi } from "./verify";
import { statusApi } from "./status";
import { onrampSessionHandler } from "./onramp";
import { GUIDE_PARTS } from "./x402/guide";
import { loadDotenv } from "./lib/dotenv-safe";

await loadDotenv();

const app = new Hono();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

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

app.route("/api/x402", x402Gateway);
app.route("/api/data", dataApi);
app.route("/api/verify", verifyApi);
app.route("/api/status", statusApi);
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
