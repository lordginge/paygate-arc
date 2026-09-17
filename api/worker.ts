// Cloudflare Workers entry: /api/* handled by the Hono app, everything else
// served from static assets with SPA fallback (configured in wrangler.jsonc).
import app from "./boot";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
