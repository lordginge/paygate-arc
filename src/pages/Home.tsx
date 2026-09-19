import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import LiveTxTicker from "@/components/LiveTxTicker";
import { TrialCard } from "@/components/TrialCard";
import { trpc } from "@/providers/trpc";
import { ArrowUpRight, Copy, Check, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price_usdc: string;
  sellers?: { wallet_address: string; display_name: string } | null;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function Home() {
  const endpoints = trpc.marketplace.listEndpoints.useQuery();
  const stats = trpc.marketplace.globalStats.useQuery();
  const [copied, setCopied] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [proofAsset, setProofAsset] = useState("");
  const [proofSide, setProofSide] = useState<"long" | "short">("long");
  const [proofHours, setProofHours] = useState(24);
  const [betaReceipt, setBetaReceipt] = useState<string>("");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) setPlaying(false);
  }, []);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const rows = (endpoints.data ?? []) as unknown as EndpointRow[];

  async function makeBetaReceipt() {
    const payload = {
      asset: proofAsset.trim() || "0x0000000000000000000000000000000000000000",
      side: proofSide,
      thresholdBps: 2500,
      expiresInHours: proofHours,
      createdAt: new Date().toISOString(),
      winnerPost: `Called it. +25% on ${proofAsset || "this CA"}. Timestamped on PayGate Proof of Call.`,
      loserPost: `Took the L. -25% on ${proofAsset || "this CA"}. Timestamped on PayGate Proof of Call.`,
    };
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    const hash = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setBetaReceipt(hash);
  }

  return (
    <div className="min-h-screen text-white/90 antialiased">
      <Fibres playing={playing} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      {/* Pause control, fixed bottom-right, quiet until hovered */}
      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause background motion" : "Play background motion"}
        className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/40 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>

      {/* Hero */}
      <section className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-5 pt-36 pb-24 md:px-6 md:pt-28">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">
            x402 protocol
          </span>
          <span className="mono-chip">Arc mainnet</span>
          <span className="mono-chip">USDC native</span>
        </div>

        <h1
          className="m3-display mt-10 text-white"
          style={{
            fontSize: "clamp(2.6rem, 6.2vw, 5.25rem)",
          }}
        >
          Turn API calls
          <br />
          into collateral.
        </h1>

        <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-white/50">
          PayGate wraps any HTTP endpoint with an x402 paywall. Agents and
          developers pay per call in native USDC on Arc, settled in real time
          by Circle&rsquo;s Facilitator Service. Every call pays. Every payment
          builds credit: seller float is supplied to Aave V4 as collateral,
          turning on-chain revenue into working capital.
        </p>

        <div className="mt-12 flex flex-wrap gap-4">
          <a href="/sell" className="btn-block">
            Start selling
          </a>
          <a href="/docs" className="btn-block-ghost">
            Read the docs
          </a>
        </div>

        {/* First-login trial: zero-value signature -> $1 credit */}
        <div className="mt-10">
          <TrialCard />
        </div>

        {/* Proof of call: degen scoreboard concept */}
        <div className="m3e-frame mt-6 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="mono-label text-[#3B6DFF]">Proof of call</span>
            <span className="m3e-chip">1 post only</span>
          </div>
          <h2 className="m3-headline mt-4 text-2xl text-white">
            So you think you’re degen?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
            How to play: pick asset, entry, direction, expiry. Sign the call,
            pay the x402 fee, lock the hash before the chart moves. Outcome:
            +25% posts one winner card, -25% posts one loser card, between
            bands is no blood. Only 3 scored calls per 24h move the board.
            Timestamps do not care about feelings.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ["Proof", "Hash, block time, wallet, entry price."],
              ["Winner", "Blue card. One brag. Verify link included."],
              ["Loser", "Red card. One L. No mystery deletes."],
              ["Redemption", "Missed? Straight back into the next call."],
            ].map(([t, d]) => (
              <div key={t} className="m3e-frame-soft p-4">
                <p className="mono-label text-white/35">{t}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{d}</p>
              </div>
            ))}
          </div>

          <div className="m3e-frame-soft mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="mono-label text-white/40">Beta concept</p>
              <span className="m3e-chip">local receipt · no live post</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <input
                value={proofAsset}
                onChange={(e) => setProofAsset(e.target.value)}
                placeholder="Token CA, ticker shown later"
                spellCheck={false}
                className="m3e-input px-4 py-3 font-mono text-xs text-white placeholder:text-white/25 md:col-span-2"
              />
              <select
                value={proofSide}
                onChange={(e) => setProofSide(e.target.value as "long" | "short")}
                className="m3e-input px-4 py-3 text-sm text-white"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
              <label className="m3e-input flex items-center gap-3 px-4 py-2">
                <span className="mono-label text-white/35">{proofHours}h</span>
                <input
                  type="range"
                  min="1"
                  max="72"
                  value={proofHours}
                  onChange={(e) => setProofHours(Number(e.target.value))}
                  className="m3e-slider"
                  aria-label="Expiry hours"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={makeBetaReceipt} className="btn-block !px-6 !py-3 text-[11px]">
                GENERATE BETA RECEIPT
              </button>
              {betaReceipt && (
                <code className="break-all font-mono text-xs text-[#B9CCFF]">
                  beta:{betaReceipt.slice(0, 24)}…{betaReceipt.slice(-8)}
                </code>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/30">
              This only hashes the beta payload in your browser. It does not
              pay, watch price, post, or write on-chain yet.
            </p>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-white/30">
            Social posting needs a one-post consent permit. Points need the
            proof-of-call ledger before they become real standings.
          </p>
        </div>

        {/* Live settle ticker: latest payment, click through to explorer */}
        <div className="mt-10 inline-block">
          <LiveTxTicker />
        </div>

        {/* Stats strip */}
        <div className="mt-20 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Live endpoints", value: stats.data?.endpointCount ?? "—" },
            { label: "Payments settled", value: stats.data?.paymentCount ?? "—" },
            {
              label: "Volume, USDC",
              value: stats.data != null ? stats.data.volumeUsdc.toFixed(2) : "—",
            },
            { label: "Chain ID", value: "5042" },
          ].map((s, i) => (
            <div
              key={s.label}
              className="m3e-frame-soft px-6 py-6"
            >
              <div className="text-3xl font-light tracking-tight text-white tabular-nums">
                {s.value}
              </div>
              <div className="mono-label mt-2 text-white/35">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works: numbered ledger */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="border-t border-white/10 pt-12">
          <span className="mono-label text-[#3B6DFF]">How it works</span>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                t: "Wrap",
                d: "Point PayGate at any HTTPS endpoint and set a USDC price. Unpaid traffic never reaches your upstream.",
              },
              {
                n: "02",
                t: "Charge",
                d: "Callers get HTTP 402, sign an EIP-3009 authorisation, and retry. Machines welcome: no accounts, no sessions.",
              },
              {
                n: "03",
                t: "Settle",
                d: "Circle Facilitator settles on Arc in real time, straight to your Circle payout wallet. Withdraw any time.",
              },
              {
                n: "04",
                t: "Compound",
                d: "Seller float is supplied to Aave V4 as USDC collateral. Your payment history becomes your credit line: borrow working capital against future revenue instead of cashing out.",
              },
            ].map((s) => (
              <div key={s.n} className="m3e-frame-soft p-8">
                <div className="mono-label text-white/30">{s.n}</div>
                <div className="mt-4 text-xl font-medium tracking-tight text-white">
                  {s.t}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/45">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Directory */}
      <section className="relative mx-auto max-w-6xl px-6 pb-28">
        <div className="mb-2 flex items-baseline justify-between border-t border-white/10 pt-12">
          <div>
            <span className="mono-label text-[#3B6DFF]">Directory</span>
            <h2 className="m3-headline mt-3 text-2xl text-white">
              Endpoints for sale
            </h2>
          </div>
          <span className="mono-label text-white/30">
            Per call / settled on Arc
          </span>
        </div>

        {endpoints.isLoading && (
          <p className="py-10 mono-label text-white/35">Loading endpoints…</p>
        )}
        {!endpoints.isLoading && rows.length === 0 && (
          <p className="py-10 text-sm text-white/50">
            No endpoints yet. Be the first:{" "}
            <a href="/sell" className="link-line text-[#3B6DFF]">
              sell an API
            </a>
            .
          </p>
        )}

        <div>
          {rows.map((e, i) => (
            <div
              key={e.id}
              className="group grid gap-3 border-b border-white/10 py-7 md:grid-cols-[64px_1fr_auto] md:items-center md:gap-8"
            >
              <span className="mono-label text-white/25 hidden md:block">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="text-[17px] font-medium tracking-tight text-white">
                    {e.name}
                  </h3>
                  <span className="mono-label text-white/30">{e.category}</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/45">
                  {e.description || "No description provided."}
                </p>
                <p className="mono-label mt-3 text-white/25">
                  by {e.sellers?.display_name ?? "unknown"}
                  {e.sellers?.wallet_address
                    ? ` / ${shortAddr(e.sellers.wallet_address)}`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-2.5">
                <span className="whitespace-nowrap text-[15px] font-light tabular-nums text-[#3B6DFF]">
                  ${Number(e.price_usdc).toFixed(4)}
                  <span className="ml-1 text-xs text-white/35">/ call</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <code className="truncate border border-white/15 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-white/60">
                    /api/x402/{e.slug}
                  </code>
                  <button
                    onClick={() =>
                      copy(`${window.location.origin}/api/x402/${e.slug}`, e.id)
                    }
                    className="p-1.5 text-white/40 transition-colors hover:text-white"
                    title="Copy URL"
                  >
                    {copied === e.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <a
                    href={`/api/x402/${e.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-white/40 transition-colors hover:text-white"
                    title="View 402 challenge"
                  >
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closing statement */}
      <section className="relative border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p
            className="max-w-4xl font-medium text-white"
            style={{
              fontSize: "clamp(1.75rem, 3.6vw, 3rem)",
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
            }}
          >
            Every call pays.{" "}
            <span className="text-[#3B6DFF]">Every payment builds credit.</span>
          </p>
          <div className="mt-10 flex flex-wrap gap-10">
            <a href="/sell" className="mono-label link-line text-white/80">
              Sell an API
            </a>
            <a href="/docs" className="mono-label link-line text-white/80">
              Read the docs
            </a>
            <a
              href="https://github.com/lordginge/paygate-arc"
              target="_blank"
              rel="noreferrer"
              className="mono-label link-line text-white/80"
            >
              Source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
