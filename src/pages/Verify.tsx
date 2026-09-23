import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { useEffect, useState } from "react";

type VerifyResult = {
  txHash: string;
  blockNumber: number;
  status: string;
  eip3009Settlement: boolean;
  usdcTransfers: { from: string; to: string; valueUsdc: number }[];
  ledger:
    | { state: "unavailable" | "no-match" }
    | {
        state: "matched";
        receipt: { paymentId: string; payer: string; slug: string | null }[];
      };
  explorerUrl: string;
};

type RecentFill = {
  id: string;
  txHash: string | null;
  payer: string;
  slug: string | null;
  explorerUrl: string | null;
};

function shortAddr(a: string) {
  return `${a.slice(0, 8)}...${a.slice(-6)}`;
}

type IndexSummary = {
  eip3009SettlementCount: number;
  eip3009VolumeUsdc: number;
  uniquePayers: number;
  cursor: number;
  head: number;
  caughtUp: boolean;
};

export default function Verify() {
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentFill[]>([]);

  useEffect(() => {
    fetch("/api/verify/recent")
      .then((r) => (r.ok ? r.json() : { fills: [] }))
      .then((d) => setRecent(d.fills ?? []))
      .catch(() => undefined);
    fetch("/api/verify/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d as IndexSummary))
      .catch(() => undefined);
  }, []);

  async function lookup() {
    setErr("");
    setResult(null);
    const h = hash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
      setErr("That does not look like an Arc transaction hash (0x + 64 hex characters).");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/verify/tx/${h}`);
      const body = await r.json();
      if (!r.ok) {
        setErr(body.error ?? "Lookup failed");
      } else {
        setResult(body as VerifyResult);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-4xl px-6 pt-32 pb-24">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Verify</span>
        <h1
          className="m3-display mt-8 text-white"
          style={{ fontSize: "clamp(2rem,5vw,3.8rem)" }}
        >
          Do not trust the dashboard. Check the chain.
        </h1>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-white/50">
          Paste any Arc transaction hash. We read the receipt straight from
          Arc RPC, decode the USDC transfer, check whether it was an EIP-3009
          settlement, and show the gateway receipt that matches it. If we
          cannot corroborate something, we say so.
        </p>

        {summary && (
          <div className="m3e-frame-soft mt-8 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              [summary.eip3009SettlementCount.toLocaleString(), "EIP-3009 settlements indexed"],
              [`$${summary.eip3009VolumeUsdc.toFixed(2)}`, "USDC volume, indexed"],
              [summary.uniquePayers.toLocaleString(), "unique payers"],
              [
                summary.caughtUp ? "caught up" : `${(summary.head - summary.cursor).toLocaleString()} behind`,
                "indexer lag",
              ],
            ].map(([v, l]) => (
              <div key={l as string}>
                <p className="text-lg font-medium text-white">{v}</p>
                <p className="mt-1 text-[11px] text-white/35">{l}</p>
              </div>
            ))}
          </div>
        )}

        <div className="m3e-frame mt-10 p-6">
          <label className="mono-label text-white/40">Transaction hash</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="0x..."
              className="m3e-input min-w-0 flex-1 font-mono text-sm text-white"
              onKeyDown={(e) => e.key === "Enter" && void lookup()}
            />
            <button
              type="button"
              className="btn-block !px-6"
              disabled={loading}
              onClick={() => void lookup()}
            >
              {loading ? "READING CHAIN..." : "VERIFY"}
            </button>
          </div>
          {err && <p className="mt-4 text-sm text-[#FF8A8A]">{err}</p>}

          {result && (
            <div className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="m3e-frame-soft p-4">
                  <p className="mono-label text-white/30">Status</p>
                  <p className={result.status === "success" ? "mt-2 text-[#7CE38B]" : "mt-2 text-[#FF8A8A]"}>
                    {result.status}
                  </p>
                </div>
                <div className="m3e-frame-soft p-4">
                  <p className="mono-label text-white/30">Block</p>
                  <p className="mt-2 text-white">{result.blockNumber.toLocaleString()}</p>
                </div>
                <div className="m3e-frame-soft p-4">
                  <p className="mono-label text-white/30">EIP-3009 settlement</p>
                  <p className={result.eip3009Settlement ? "mt-2 text-[#7CE38B]" : "mt-2 text-white/40"}>
                    {result.eip3009Settlement ? "YES" : "NO"}
                  </p>
                </div>
              </div>

              {result.usdcTransfers.length > 0 && (
                <div className="m3e-frame-soft p-4">
                  <p className="mono-label text-white/30">USDC transfers in this transaction</p>
                  <div className="mt-3 space-y-2">
                    {result.usdcTransfers.map((t, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 font-mono text-xs text-white/60">
                        <span>{shortAddr(t.from)}</span>
                        <span className="text-white/30">to</span>
                        <span>{shortAddr(t.to)}</span>
                        <span className="text-[#B9CCFF]">{t.valueUsdc} USDC</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="m3e-frame-soft p-4">
                <p className="mono-label text-white/30">Gateway receipt</p>
                {result.ledger.state === "matched" ? (
                  <div className="mt-3 space-y-2 text-xs text-white/60">
                    {result.ledger.receipt.map((r) => (
                      <p key={r.paymentId}>
                        Matched endpoint <span className="text-[#B9CCFF]">{r.slug ?? "unknown"}</span>, payer {shortAddr(r.payer)}, payment id {r.paymentId.slice(0, 18)}...
                      </p>
                    ))}
                  </div>
                ) : result.ledger.state === "no-match" ? (
                  <p className="mt-3 text-xs text-white/40">
                    This transaction is on-chain but is not in the PayGate
                    payment ledger. It may be a transfer that did not pass
                    through the gateway, or it predates ledger attribution.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-white/40">
                    Payment ledger unavailable on this deployment, so only the
                    on-chain side could be verified above.
                  </p>
                )}
              </div>

              <a
                className="btn-block-ghost inline-block !px-5 !py-2.5 text-xs"
                href={result.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                OPEN ON ARC EXPLORER
              </a>
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-10">
            <p className="mono-label text-white/30">Recent verified fills</p>
            <div className="mt-3 divide-y divide-white/5">
              {recent.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-3 py-3 text-xs text-white/50">
                  <span className="text-[#B9CCFF]">{f.slug ?? "endpoint"}</span>
                  <span className="font-mono">{f.txHash ? shortAddr(f.txHash) : "no tx"}</span>
                  <span>{shortAddr(f.payer)}</span>
                  {f.explorerUrl && (
                    <a href={f.explorerUrl} target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#B9CCFF]">
                      explorer
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
