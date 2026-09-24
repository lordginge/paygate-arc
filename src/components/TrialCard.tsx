import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  claimVoucher,
  connectArc,
  getTrialBalance,
  spendTrial,
} from "@/lib/trial";
import { trpc } from "@/providers/trpc";

type Phase =
  | "idle"
  | "connecting"
  | "claiming"
  | "claimed"
  | "spending"
  | "result"
  | "error";

type EndpointOption = {
  slug: string;
  name: string;
  price_usdc: string;
};

export function TrialCard() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [credit, setCredit] = useState<number>(0);
  const [slug, setSlug] = useState("arc-chain-status");
  const [ask, setAsk] = useState("");
  const [maxPrice, setMaxPrice] = useState(0.05);
  const [output, setOutput] = useState("");
  const [err, setErr] = useState("");
  const endpointsQuery = trpc.marketplace.listEndpoints.useQuery();
  const endpoints = (endpointsQuery.data ?? []) as EndpointOption[];

  const suggestions = useMemo(
    () =>
      endpoints
        .filter((e) => Number(e.price_usdc) <= maxPrice)
        .slice(0, 4),
    [endpoints, maxPrice],
  );
  const selected = endpoints.find((e) => e.slug === slug);
  const selectedPrice = selected ? Number(selected.price_usdc) : 0.05;

  useEffect(() => {
    const saved = localStorage.getItem("paygate.trialWallet");
    if (!saved || !/^0x[a-fA-F0-9]{40}$/.test(saved)) return;
    const w = saved as `0x${string}`;
    setWallet(w);
    setPhase("claimed");
    getTrialBalance(w)
      .then((b) => setCredit(b.balance_usdc))
      .catch(() => undefined);
  }, []);

  async function start() {
    setErr("");
    setPhase("connecting");
    try {
      const w = await connectArc();
      setWallet(w);
      localStorage.setItem("paygate.trialWallet", w);
      const bal = await getTrialBalance(w);
      if (bal.balance_usdc > 0) {
        setCredit(bal.balance_usdc);
        setPhase("claimed");
        return;
      }
      setPhase("claiming");
      await claimVoucher(w);
      const b2 = await getTrialBalance(w);
      setCredit(b2.balance_usdc);
      setPhase("claimed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setPhase("error");
    }
  }

  async function runTrialCall() {
    if (!wallet) return;
    setErr("");
    setPhase("spending");
    const r = await spendTrial(wallet, slug || "arc-chain-status", ask);
    setOutput(JSON.stringify(r.data, null, 2));
    setPhase("result");
    const b = await getTrialBalance(wallet);
    setCredit(b.balance_usdc);
  }

  return (
    <div className="m3e-frame p-7">
      <div className="flex items-baseline justify-between gap-4">
        <p className="mono-label text-white/40">First call, primed</p>
        {credit > 0 && (
          <p className="m3e-chip border-[#7CE38B]/30 text-[#7CE38B]">
            ${credit.toFixed(2)} CREDIT
          </p>
        )}
      </div>
      <h3 className="m3-headline mt-4 text-2xl text-white">
        Ask your own call. No email, no checkout.
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/45">
        Connect Arc once, sign for $1 trial credit, then point it at any listed
        endpoint or paste a slug. Add an optional question and it rides along as
        <span className="font-mono"> ?ask=</span>.
      </p>

      {phase === "idle" && (
        <div className="mt-6">
          <button onClick={start} className="btn-block">
            SIGN IN WITH ARC →
          </button>
          <div className="mt-4 flex flex-wrap gap-2">
            {["arc-chain-status", ...suggestions.map((s) => s.slug)]
              .filter((v, i, a) => a.indexOf(v) === i)
              .slice(0, 5)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => setSlug(s)}
                  className="m3e-chip text-white/60 hover:text-white"
                >
                  {s}
                </button>
              ))}
          </div>
        </div>
      )}
      {(phase === "connecting" || phase === "claiming") && (
        <div className="mt-6 flex items-center gap-3 text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="mono-label">
            {phase === "connecting" ? "OPENING WALLET" : "CLAIMING $1 VOUCHER"}
          </p>
        </div>
      )}
      {(phase === "claimed" || phase === "result" || phase === "error") &&
        wallet && (
          <div className="mt-6 space-y-5">
            <div className="m3e-frame-soft p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="mono-label text-white/35">Suggestion cap</span>
                <span className="mono-label text-[#3B6DFF]">
                  ≤ ${maxPrice.toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.25"
                step="0.001"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="m3e-slider mt-2"
                aria-label="Maximum suggested endpoint price"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((e) => (
                  <button
                    key={e.slug}
                    onClick={() => setSlug(e.slug)}
                    className={`m3e-chip ${slug === e.slug ? "border-[#3B6DFF]/60 text-white" : "text-white/55 hover:text-white"}`}
                  >
                    {e.slug}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mono-label text-white/30">Endpoint</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  list="paygate-endpoints"
                  spellCheck={false}
                  className="m3e-input mt-2 w-full px-4 py-4 font-mono text-sm text-white placeholder:text-white/25"
                />
                <datalist id="paygate-endpoints">
                  {endpoints.map((e) => (
                    <option key={e.slug} value={e.slug}>
                      {e.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="mono-label text-white/30">Ask (optional)</span>
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="latest block, tx for 0x…, price of ETH"
                  className="m3e-input mt-2 w-full px-4 py-4 text-sm text-white placeholder:text-white/25"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={runTrialCall} className="btn-block">
                RUN {slug || "arc-chain-status"} (${selectedPrice.toFixed(3)}) →
              </button>
              <p className="mono-label text-white/30">
                {wallet.slice(0, 6)}…{wallet.slice(-4)}
              </p>
            </div>
          </div>
        )}
      {phase === "spending" && (
        <div className="mt-6 flex items-center gap-3 text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="mono-label">SIGNING PAYMENT + CALLING…</p>
        </div>
      )}
      {phase === "result" && output && (
        <pre className="m3e-frame-soft mt-5 max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed text-white/70">
          {output}
        </pre>
      )}
      {phase === "error" && (
        <div className="mt-6">
          <p className="mono-label text-[#E5484D]">{err.toUpperCase()}</p>
          <button onClick={start} className="btn-block-ghost mt-4">
            RETRY
          </button>
        </div>
      )}
      <p className="mt-5 text-xs leading-relaxed text-white/25">
        Trial credit covers sandbox-priced endpoints. When a call clears, a real
        x402 payment settles to the seller in USDC on Arc in under a second.
      </p>
    </div>
  );
}
