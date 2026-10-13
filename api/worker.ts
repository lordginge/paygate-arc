// Cloudflare Workers entry: /api/* handled by the Hono app, everything else
// served from static assets with SPA fallback (configured in wrangler.jsonc).
// axios fetch-adapter fix must run before the Circle SDK modules load.
import "./lib/axiosFetchDefaults";
import app from "./boot";