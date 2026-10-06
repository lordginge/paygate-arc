// Circle email sign-in for buyers (user-controlled wallets).
//
// The whole point: someone who has never touched crypto clicks
// "continue with email", gets a one-time code, picks a 6-digit PIN,
// and owns a real Arc wallet. No extension, no seed phrase, no gas
// token to understand (Arc fees are USDC itself).
//
// Key custody stays with Circle's MPC infrastructure. This app never
// sees keys, PINs, or OTP codes. The SDK is loaded lazily on first
// click so the main bundle stays lean.

export type CircleSession = {
  kind: "circle";
  email: string;
  userToken: string;
  encryptionKey: string;
  walletId: string;
  address: `0x${string}`;
};

type W3SSdkType = import("@circle-fin/w3s-pw-web-sdk").W3SSdk;

let sdkPromise: Promise<W3SSdkType> | null = null;
let loginResolve: ((s: { userToken: string; encryptionKey: string }) => void) | null = null;
let loginReject: ((e: Error) => void) | null = null;

const SESSION_KEY = "paygate.circleSession";
const EMAIL_KEY = "paygate.circleEmail";

export function savedCircleEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function saveCircleSession(s: CircleSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    localStorage.setItem(EMAIL_KEY, s.email);
  } catch {
    /* private mode: session lives in memory only */
  }
}

export function loadCircleSession(): CircleSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CircleSession;
    if (s?.kind !== "circle" || !s.userToken || !/^0x[a-fA-F0-9]{40}$/.test(s.address)) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearCircleSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchCircleConfig(): Promise<{ ready: boolean; appId: string | null } | null> {
  // On failure we resolve to null so callers keep their initial render;
  // a hard {ready:false} here would flash a "coming soon" notice on
  // transient network errors and diverge from the prerendered HTML.
  try {
    const res = await fetch("/api/circle/config");
    if (!res.ok) return null;
    return (await res.json()) as { ready: boolean; appId: string | null };
  } catch {
    return null;
  }
}

// One SDK instance for the whole app. The login callback is wired to the
// in-flight email sign-in attempt via the module-level resolve/reject.
export async function getCircleSdk(appId: string): Promise<W3SSdkType> {
  if (!sdkPromise) {
    sdkPromise = import("@circle-fin/w3s-pw-web-sdk").then(({ W3SSdk }) => {
      return new W3SSdk({ appSettings: { appId } }, (error: unknown, result: unknown) => {
        const r = result as { userToken?: string; encryptionKey?: string } | undefined;
        if (error || !r?.userToken || !r?.encryptionKey) {
          const msg =
            (error as { message?: string } | undefined)?.message ?? "Email verification failed";
          loginReject?.(new Error(msg));
        } else {
          loginResolve?.({ userToken: r.userToken, encryptionKey: r.encryptionKey });
        }
        loginResolve = null;
        loginReject = null;
      });
    });
  }
  return sdkPromise;
}

export async function requestEmailOtp(
  appId: string,
  email: string,
): Promise<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }> {
  const sdk = await getCircleSdk(appId);
  const deviceId = await sdk.getDeviceId();
  const res = await fetch("/api/circle/email/otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, deviceId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    deviceToken?: string;
    deviceEncryptionKey?: string;
    otpToken?: string;
  };
  if (!res.ok || !body.deviceToken || !body.deviceEncryptionKey || !body.otpToken) {
    throw new Error(body.error ?? "Could not send the code. Try again.");
  }
  sdk.updateConfigs({
    appSettings: { appId },
    loginConfigs: {
      deviceToken: body.deviceToken,
      deviceEncryptionKey: body.deviceEncryptionKey,
      otpToken: body.otpToken,
    },
  });
  return {
    deviceToken: body.deviceToken,
    deviceEncryptionKey: body.deviceEncryptionKey,
    otpToken: body.otpToken,
  };
}

// Opens Circle's hosted OTP window. Resolves when the code checks out.
export function verifyEmailOtp(
  appId: string,
): Promise<{ userToken: string; encryptionKey: string }> {
  return new Promise((resolve, reject) => {
    loginResolve = resolve;
    loginReject = reject;
    getCircleSdk(appId)
      .then((sdk) => sdk.verifyOtp())
      .catch((e) => {
        loginResolve = null;
        loginReject = null;
        reject(e instanceof Error ? e : new Error("Verification failed"));
      });
  });
}

export async function fetchSessionWallet(userToken: string): Promise<{
  id: string;
  address: string;
  blockchain: string;
} | null> {
  const res = await fetch("/api/circle/users/wallets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    wallet?: { id: string; address: string; blockchain: string } | null;
  };
  if (!res.ok) throw new Error(body.error ?? "Could not load your wallet");
  return body.wallet ?? null;
}

// New users: create the PIN + wallet challenge, then drive Circle's
// hosted PIN-setup iframe to completion.
export async function initializeUserWallet(
  appId: string,
  userToken: string,
  encryptionKey: string,
): Promise<{ id: string; address: string; blockchain: string }> {
  const sdk = await getCircleSdk(appId);
  const res = await fetch("/api/circle/users/initialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; challengeId?: string };
  if (!res.ok || !body.challengeId) {
    throw new Error(body.error ?? "Could not create your wallet");
  }
  sdk.setAuthentication({ userToken, encryptionKey });
  await executeChallenge(sdk, body.challengeId);
  const wallet = await fetchSessionWallet(userToken);
  if (!wallet) throw new Error("Wallet created but not visible yet. Refresh and sign in again.");
  return wallet;
}

function executeChallenge(sdk: W3SSdkType, challengeId: string): Promise<{ signature?: string }> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error: unknown, result: unknown) => {
      if (error) {
        const msg = (error as { message?: string } | undefined)?.message ?? "Action cancelled";
        reject(new Error(msg));
        return;
      }
      const data = (result as { data?: { signature?: string } } | undefined)?.data ?? {};
      resolve(data);
    });
  });
}

// Sign EIP-712 typed data with the user's PIN. Used for x402 / EIP-3009
// payment authorisations, byte-identical to what a browser wallet signs.
export async function circleSignTypedData(
  appId: string,
  session: CircleSession,
  typedData: unknown,
): Promise<string> {
  const sdk = await getCircleSdk(appId);
  sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });
  const res = await fetch("/api/circle/sign/typed-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken: session.userToken, walletId: session.walletId, typedData }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; challengeId?: string };
  if (!res.ok || !body.challengeId) {
    throw new Error(body.error ?? "Signing failed. Sign in again and retry.");
  }
  const out = await executeChallenge(sdk, body.challengeId);
  if (!out.signature) throw new Error("No signature returned");
  return out.signature;
}

// personal_sign equivalent, used for trial credit spend calls.
export async function circlePersonalSign(
  appId: string,
  session: CircleSession,
  message: string,
): Promise<string> {
  const sdk = await getCircleSdk(appId);
  sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });
  const res = await fetch("/api/circle/sign/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userToken: session.userToken, walletId: session.walletId, message }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; challengeId?: string };
  if (!res.ok || !body.challengeId) {
    throw new Error(body.error ?? "Signing failed. Sign in again and retry.");
  }
  const out = await executeChallenge(sdk, body.challengeId);
  if (!out.signature) throw new Error("No signature returned");
  return out.signature;
}
