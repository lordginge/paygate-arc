import { useCallback, useEffect, useState } from "react";
import {
  connectArc,
  claimVoucher,
  spendTrial,
  getTrialBalance,
  type TrialBalance,
} from "../lib/trial";

type Phase =
  | "idle"
  | "connecting"
  | "claiming"
  | "claimed"
  | "spending"
  | "result"
  | "error";

// First-login trial: sign a zero-value authorisation, get $1 of credit,
// spend it on a live endpoint. No USDC leaves the wallet.
export function TrialCard() {
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<TrialBalance | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<string>("");

  const refresh = useCallback(async (w: string) => {
    try {
      setBalance(await getTrialBalance(w));
    } catch {
      /* balance endpoint is best-effort */
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("paygate.trialWallet");
    if (saved) {
      setWallet(saved as `0x${string}`);
      refresh(saved);
    }
  }, [refresh]);

  const start = async () => {
    setError("");
    setPhase("connecting");
    try {
      const w = await connectArc();
      setWallet(w);
      window.localStorage.setItem("paygate.trialWallet", w);
      const bal = await getTrialBalance(w);
      setBalance(bal);
      if (bal.claimed && !bal.expired) {
        setPhase("claimed");
        return;
      }
      setPhase("claiming");
      await claimVoucher(w);
      await refresh(w);
      setPhase("claimed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const runTrialCall = async () => {
    if (!wallet) return;
    setError("");
    setPhase("spending");
    try {
      const { data } = await spendTrial(wallet, "arc-chain-status");
      setResult(JSON.stringify(data, null, 2));
      await refresh(wallet);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const busy = phase === "connecting" || phase === "claiming" || phase === "spending";
  const hasCredit = balance != null && balance.claimed && !balance.expired && balance.balance_usdc > 0;

  return (
    <div className="max-w-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <span className="mono-label text-[#3B6DFF]">Free trial</span>
        {balance?.claimed && !balance.expired && (
          <span className="mono-label text-white/50">
            credit ${balance.balance_usdc.toFixed(2)}
          </span>
        )}
      </div>

      <div className="px-5 py-5">
        {!hasCredit && phase !== "result" && (
          <>
            <p className="text-[13px] leading-relaxed text-white/50">
              First login earns <span className="text-white">$1 of endpoint credit</span>,
              valid 30 days. You sign a zero-value authorisation &mdash; the same
              motion as a paid x402 call &mdash; but no USDC ever leaves your wallet.
            </p>
            <button
              onClick={start}
              disabled={busy}
              className="btn-block mt-4 disabled:opacity-40"
            >
              {phase === "connecting"
                ? "Connect wallet\u2026"
                : phase === "claiming"
                  ? "Sign to claim\u2026"
                  : "Start free trial"}
            </button>
          </>
        )}

        {hasCredit && phase !== "result" && (
          <>
            <p className="text-[13px] leading-relaxed text-white/50">
              Voucher active on{" "}
              <span className="text-white">
                {wallet?.slice(0, 6)}&hellip;{wallet?.slice(-4)}
              </span>
              . Spend credit on a live endpoint &mdash; served over our dedicated
              Arc node, logged like any paid call.
            </p>
            <button
              onClick={runTrialCall}
              disabled={busy}
              className="btn-block mt-4 disabled:opacity-40"
            >
              {phase === "spending" ? "Calling\u2026" : "Run a trial call \u00b7 arc-chain-status"}
            </button>
          </>
        )}

        {phase === "result" && (
          <>
            <div className="mono-label mb-2 text-white/35">Response &middot; paid with trial credit</div>
            <pre className="max-h-56 overflow-auto border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-[#7CE38B]">
              {result}
            </pre>
            <div className="mt-4 flex flex-wrap gap-3">
              {hasCredit && (
                <button onClick={runTrialCall} disabled={busy} className="btn-block-ghost disabled:opacity-40">
                  Call again
                </button>
              )}
              <button
                onClick={() => setPhase(hasCredit ? "claimed" : "idle")}
                className="btn-block-ghost"
              >
                Back
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <div className="mt-3 text-[12px] text-[#FF7A7A]">{error}</div>
        )}
      </div>
    </div>
  );
}
