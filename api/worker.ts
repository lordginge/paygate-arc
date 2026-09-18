// Cloudflare Workers entry: /api/* handled by the Hono app, everything else
// served from static assets with SPA fallback (configured in wrangler.jsonc).
import app from "./boot";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.circle.com https://onramp.arc.io https://rpc.mainnet.arc.io https://xdsgayetciytzopnzjab.supabase.co https://api.coingecko.com https://api.binance.com https://api.binance.us https://api1.binance.com",
  "frame-src https://onramp.arc.io",
].join("; ");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request);
    }
    const res = await env.ASSETS.fetch(request);
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      const r = new Response(res.body, res);
      r.headers.set("Content-Security-Policy", CSP);
      return r;
    }
    return res;
  },
};
