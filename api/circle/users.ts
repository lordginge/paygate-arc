// Circle user-controlled wallets: email sign-in for buyers.
//
// A newcomer gets a real Arc wallet with an email code and a 6-digit PIN.
// Circle secures the key shares; this server never sees keys, PINs, or
// signatures. Wallets are EOAs, so signatures are plain ECDSA and the
// existing x402 / EIP-3009 payment flow works unchanged.
//
// Server-side this module only ever creates *challenges*. The actual PIN
// prompt and signing happen inside Circle's hosted iframe in the browser.
//
// Requires CIRCLE_API_KEY (already used for seller wallets) and
// CIRCLE_APP_ID (Circle Console -> Wallets -> User Controlled -> Configurator).
// Email delivery needs SMTP configured in the Circle Console. When
// CIRCLE_APP_ID is missing the /config route reports ready:false and the
// site hides the email option instead of failing.

import { Hono } from "hono";
import { loadDotenv } from "../lib/dotenv-safe.js";
import { callerKey, rateLimited } from "../lib/rateLimit.js";

await loadDotenv();

const { CIRCLE_API_KEY = "", CIRCLE_APP_ID = "" } = process.env;

export function userWalletsReady(): boolean {
  return Boolean(CIRCLE_API_KEY && CIRCLE_APP_ID);
}

type UCClient = Awaited<
  ReturnType<
    (typeof import("@circle-fin/user-controlled-wallets"))["initiateUserControlledWalletsClient"]
  >
>;

let clientPromise: Promise<UCClient> | null = null;

async function getClient(): Promise<UCClient> {
  if (!CIRCLE_API_KEY) {
    throw new Error("Circle API key not configured");
  }
  if (!clientPromise) {
    clientPromise = import("@circle-fin/user-controlled-wallets").then(
      (m) =>
        m.initiateUserControlledWalletsClient({
          apiKey: CIRCLE_API_KEY,
        }) as unknown as UCClient,
    );
  }
  return clientPromise;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function circleError(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; code?: number } }; message?: string };
  return ax?.response?.data?.message ?? ax?.message ?? "Circle request failed";
}

export const circleUsersApi = new Hono();

// Public client config. The App ID is designed to be exposed to browsers.
circleUsersApi.get("/config", (c) => {
  return c.json({
    ready: userWalletsReady(),
    appId: userWalletsReady() ? CIRCLE_APP_ID : null,
  });
});

// Step 1: start email sign-in. Circle sends the one-time code.
circleUsersApi.post("/email/otp", async (c) => {
  if (!userWalletsReady()) return c.json({ error: "Email sign-in not enabled" }, 503);
  const rl = rateLimited(callerKey(c.req.raw, "circle-otp"), { limit: 5, windowMs: 60_000 });
  if (rl.limited) {
    return c.json({ error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` }, 429);
  }
  let body: { email?: string; deviceId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();
  if (!EMAIL_RE.test(email)) return c.json({ error: "Enter a valid email address" }, 400);
  if (!deviceId || deviceId.length > 128) return c.json({ error: "Missing device id" }, 400);
  try {
    const client = await getClient();
    const res = await client.createDeviceTokenForEmailLogin({ deviceId, email });
    const d = res.data;
    if (!d?.deviceToken || !d?.deviceEncryptionKey || !d?.otpToken) {
      throw new Error("Circle returned an incomplete OTP session");
    }
    return c.json({
      deviceToken: d.deviceToken,
      deviceEncryptionKey: d.deviceEncryptionKey,
      otpToken: d.otpToken,
    });
  } catch (e) {
    return c.json({ error: circleError(e) }, 502);
  }
});

// Step 2 (new users only): create the PIN + Arc wallet challenge.
circleUsersApi.post("/users/initialize", async (c) => {
  if (!userWalletsReady()) return c.json({ error: "Email sign-in not enabled" }, 503);
  let body: { userToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  const userToken = (body.userToken ?? "").trim();
  if (!userToken) return c.json({ error: "Missing user token" }, 400);
  try {
    const client = await getClient();
    const res = await client.createUserPinWithWallets({
      userToken,
      // SDK's blockchain enum lags the chain list; ARC is supported at runtime.
      blockchains: ["ARC" as never],
    });
    const challengeId = res.data?.challengeId;
    if (!challengeId) throw new Error("Circle returned no challenge");
    return c.json({ challengeId });
  } catch (e) {
    return c.json({ error: circleError(e) }, 502);
  }
});

// Returning users: look up the wallet for this session.
circleUsersApi.post("/users/wallets", async (c) => {
  if (!userWalletsReady()) return c.json({ error: "Email sign-in not enabled" }, 503);
  let body: { userToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  const userToken = (body.userToken ?? "").trim();
  if (!userToken) return c.json({ error: "Missing user token" }, 400);
  try {
    const client = await getClient();
    const res = await client.listWallets({ userToken });
    const wallets = (res.data?.wallets ?? [])
      .filter((w) => w.id && w.address)
      .map((w) => ({
        id: w.id as string,
        address: (w.address as string).toLowerCase(),
        blockchain: String(w.blockchain ?? ""),
      }));
    const arc = wallets.find((w) => w.blockchain === "ARC") ?? wallets[0] ?? null;
    return c.json({ wallet: arc });
  } catch (e) {
    return c.json({ error: circleError(e) }, 502);
  }
});

// Create an EIP-712 signing challenge (x402 / EIP-3009 authorisations).
circleUsersApi.post("/sign/typed-data", async (c) => {
  if (!userWalletsReady()) return c.json({ error: "Email sign-in not enabled" }, 503);
  let body: { userToken?: string; walletId?: string; typedData?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  const userToken = (body.userToken ?? "").trim();
  const walletId = (body.walletId ?? "").trim();
  if (!userToken || !UUID_RE.test(walletId) || typeof body.typedData !== "object" || !body.typedData) {
    return c.json({ error: "Missing or invalid fields" }, 400);
  }
  try {
    const client = await getClient();
    const res = await client.signTypedData({
      userToken,
      walletId,
      data: JSON.stringify(body.typedData),
    });
    const challengeId = res.data?.challengeId;
    if (!challengeId) throw new Error("Circle returned no challenge");
    return c.json({ challengeId });
  } catch (e) {
    return c.json({ error: circleError(e) }, 502);
  }
});

// Create a personal_sign challenge (trial credit spend calls).
circleUsersApi.post("/sign/message", async (c) => {
  if (!userWalletsReady()) return c.json({ error: "Email sign-in not enabled" }, 503);
  let body: { userToken?: string; walletId?: string; message?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  const userToken = (body.userToken ?? "").trim();
  const walletId = (body.walletId ?? "").trim();
  const message = body.message ?? "";
  if (!userToken || !UUID_RE.test(walletId) || !message || message.length > 512) {
    return c.json({ error: "Missing or invalid fields" }, 400);
  }
  try {
    const client = await getClient();
    const res = await client.signMessage({ userToken, walletId, message });
    const challengeId = res.data?.challengeId;
    if (!challengeId) throw new Error("Circle returned no challenge");
    return c.json({ challengeId });
  } catch (e) {
    return c.json({ error: circleError(e) }, 502);
  }
});
