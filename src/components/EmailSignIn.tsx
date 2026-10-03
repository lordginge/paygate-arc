import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  circlePersonalSign,
  circleSignTypedData,
  fetchCircleConfig,
  fetchSessionWallet,
  initializeUserWallet,
  requestEmailOtp,
  savedCircleEmail,
  saveCircleSession,
  verifyEmailOtp,
} from "@/lib/circleWallet";
import type { CircleSession } from "@/lib/circleWallet";
import type { Signers } from "@/lib/trial";

type Stage = "email" | "code" | "wallet" | "error";

// Email-first wallet creation for people who have never touched crypto.
// Email code -> 6-digit PIN -> real Arc wallet. Circle holds the keys,
// we never see them.
export function EmailSignIn(props: {
  onSession: (session: CircleSession, signers: Signers) => void;
}) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(savedCircleEmail() ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cfg, setCfg] = useState<{ ready: boolean; appId: string | null } | null>(null);

  useEffect(() => {
    fetchCircleConfig().then(setCfg);
  }, []);

  if (!cfg) return null;
  if (!cfg.ready || !cfg.appId) {
    return (
      <div className="m3e-frame-soft mt-4 p-4">
        <p className="mono-label text-white/35">
          EMAIL SIGN-IN IS BEING SWITCHED ON. USE A WALLET BELOW FOR NOW.
        </p>
      </div>
    );
  }
  const appId = cfg.appId;

  function makeSigners(session: CircleSession): Signers {
    return {
      signTypedData: (td) => circleSignTypedData(appId, session, td),
      personalSign: (msg) => circlePersonalSign(appId, session, msg),
    };
  }

  async function start() {
    setErr("");
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setErr("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await requestEmailOtp(appId, trimmed);
      setStage("code");
      // Circle's hosted window takes over: user types the code there.
      const login = await verifyEmailOtp(appId);
      setStage("wallet");
      // Returning user? Their wallet already exists. New user? Create it
      // with the PIN they are about to set in Circle's window.
      let wallet = await fetchSessionWallet(login.userToken);
      if (!wallet) {
        wallet = await initializeUserWallet(appId, login.userToken, login.encryptionKey);
      }
      const session: CircleSession = {
        kind: "circle",
        email: trimmed,
        userToken: login.userToken,
        encryptionKey: login.encryptionKey,
        walletId: wallet.id,
        address: wallet.address.toLowerCase() as `0x${string}`,
      };
      saveCircleSession(session);
      props.onSession(session, makeSigners(session));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed. Try again.");
      setStage("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {(stage === "email" || stage === "error") && (
        <div>
          <label className="block">
            <span className="mono-label text-white/30">Your email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void start();
              }}
              placeholder="you@example.com"
              autoComplete="email"
              className="m3e-input mt-2 w-full px-4 py-4 text-sm text-white placeholder:text-white/25"
            />
          </label>
          <button onClick={() => void start()} disabled={busy} className="btn-block mt-3">
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> SENDING CODE…
              </span>
            ) : (
              "CONTINUE WITH EMAIL →"
            )}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-white/35">
            We email you a one-time code, then you pick a 6-digit PIN. That is
            the whole setup. No downloads, no recovery phrases, and your money
            stays yours: the wallet is secured by Circle, the company behind
            USDC, and PayGate never sees your PIN.
          </p>
          {stage === "error" && err && (
            <p className="mono-label mt-3 text-[#E5484D]">{err.toUpperCase()}</p>
          )}
        </div>
      )}
      {stage === "code" && (
        <div className="m3e-frame-soft p-4">
          <div className="flex items-center gap-3 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">
              Code sent to <span className="text-white">{email}</span>. Enter it
              in the secure Circle window.
            </p>
          </div>
        </div>
      )}
      {stage === "wallet" && (
        <div className="m3e-frame-soft p-4">
          <div className="flex items-center gap-3 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">
              Almost there. Pick your 6-digit PIN in the Circle window and your
              wallet is ready.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
