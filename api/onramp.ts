// Onramp session route: mints short-lived widget sessions server-side so
// the Circle API key never reaches the browser. Users buy USDC/EURC on Arc
// with card, Apple Pay or Google Pay via the App Kit Onramp widget.
//
// The App Kit is created lazily on first request: module evaluation must not
// require secrets, because `wrangler deploy` evaluates the Worker at upload
// time (before secrets are available) and fails the deploy otherwise.
import {
  createAppServerKit,
  createSessionRouteHandler,
} from "@circle-fin/app-kit/server";
import { loadDotenv } from "./lib/dotenv-safe";

type SessionHandler = (req: Request) => Promise<Response> | Response;

let handler: SessionHandler | null = null;
let envLoaded = false;

export async function onrampSessionHandler(req: Request): Promise<Response> {
  if (!envLoaded) {
    await loadDotenv();
    envLoaded = true;
  }
  if (!handler) {
    const apiKey = process.env.CIRCLE_API_KEY ?? "";
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "onramp_not_configured" }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    // Bare hostname of the page embedding the iframe (frame-ancestor allowlist).
    const referrerDomain = process.env.ONRAMP_REFERRER_DOMAIN ?? "localhost";
    const server = createAppServerKit({
      onramp: { apiKey, referrerDomain },
    });
    handler = createSessionRouteHandler(server.onramp) as SessionHandler;
  }
  return handler(req);
}
