// Cloudflare Workers entry: /api/* handled by the Hono app, everything else
// served from static assets with SPA fallback (configured in wrangler.jsonc).
import app from "./boot";
import { advanceIndexer } from "./lib/indexer";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.circle.com https://pw-auth.circle.com https://onramp.arc.io https://rpc.mainnet.arc.io https://xdsgayetciytzopnzjab.supabase.co https://api.coingecko.com https://api.binance.com https://api.binance.us https://api1.binance.com",
  "frame-src https://onramp.arc.io https://pw-auth.circle.com",
].join("; ");

// Canonical host: every other spelling (http, www) permanently redirects so
// search engines consolidate signals on one origin.
const CANONICAL_HOST = "paygatex402.com";

// Server-side route allowlist. Anything else extensionless is a genuine 404
// (assets with a file extension fall through to the assets binding, which
// answers 404 on its own). Keep in sync with src/App.tsx routes.
const PAGE_ROUTES = new Set([
  "/",
  "/sell",
  "/docs",
  "/fund",
  "/verify",
  "/status",
  "/dashboard",
  "/legal",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Canonicalise: http -> https, www -> apex. One redirect, no chains.
    // 308 for non-GET so paid API calls keep method and body.
    if (
      url.protocol === "http:" ||
      url.hostname === `www.${CANONICAL_HOST}`
    ) {
      return Response.redirect(
        `https://${CANONICAL_HOST}${url.pathname}${url.search}`,
        request.method === "GET" || request.method === "HEAD" ? 301 : 308,
      );
    }

    if (
      url.pathname.startsWith("/api/") ||
      url.pathname === "/.well-known/x402" ||
      url.pathname.startsWith("/.well-known/") ||
      url.pathname === "/openapi.json"
    ) {
      return app.fetch(request);
    }

    // Real 404s for unknown pages: the SPA fallback would otherwise answer
    // 200 for every typo, which search engines read as soft 404s.
    const normalised =
      url.pathname !== "/" && url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;
    const looksLikeFile = /\.[a-z0-9]+$/i.test(normalised);
    if (
      request.method === "GET" &&
      !looksLikeFile &&
      !PAGE_ROUTES.has(normalised)
    ) {
      const notFound = await env.ASSETS.fetch(
        new Request(new URL("/404.html", request.url).toString(), {
          headers: request.headers,
        }),
      );
      const body = notFound.ok
        ? notFound.body
        : "<!doctype html><title>404</title><h1>Not found</h1>";
      return new Response(body, {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Content-Security-Policy": CSP,
          "cache-control": "public, max-age=300",
        },
      });
    }

    const res = await env.ASSETS.fetch(request);
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      const r = new Response(res.body, res);
      r.headers.set("Content-Security-Policy", CSP);
      return r;
    }
    // Hashed build assets are immutable; let them cache at the edge for a
    // year. Unhashed files keep the assets binding's default caching.
    if (url.pathname.startsWith("/assets/")) {
      const r = new Response(res.body, res);
      r.headers.set("cache-control", "public, max-age=31536000, immutable");
      return r;
    }
    return res;
  },
  // On-chain EIP-3009 indexer: advances the Arc AuthorizationUsed sweep.
  // Backfills in chunks until caught up, then tails the head. Idempotent.
  async scheduled(
    _event: unknown,
    _env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ): Promise<void> {
    ctx.waitUntil(
      advanceIndexer()
        .then((r) =>
          console.log(
            `indexer advance: from=${r.from} to=${r.to} events=${r.events} caughtUp=${r.caughtUp}`,
          ),
        )
        // Log, then rethrow: a swallowed failure is invisible in Workers
        // analytics (the 21.17M cursor stall looked "green" for hours).
        // A thrown cron error surfaces in the errors metric.
        .catch((e) => {
          console.error("indexer advance failed:", e);
          throw e;
        }),
    );
  },
};
