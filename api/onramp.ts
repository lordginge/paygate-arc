// Onramp session route: mints short-lived widget sessions server-side so
// the Circle API key never reaches the browser. Users buy USDC/EURC on Arc
// with card, Apple Pay or Google Pay via the App Kit Onramp widget.
import {
  createAppServerKit,
  createSessionRouteHandler,
} from "@circle-fin/app-kit/server";
import { loadDotenv } from "./lib/dotenv-safe";

await loadDotenv();

const apiKey = process.env.CIRCLE_API_KEY ?? "";
// Bare hostname of the page embedding the iframe (frame-ancestor allowlist).
// Defaults to local dev; set ONRAMP_REFERRER_DOMAIN in production.
const referrerDomain = process.env.ONRAMP_REFERRER_DOMAIN ?? "localhost";

const server = createAppServerKit({
  onramp: { apiKey, referrerDomain },
});

export const onrampSessionHandler = createSessionRouteHandler(server.onramp);
