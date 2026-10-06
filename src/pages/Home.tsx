import { SiteHeader } from "@/components/SiteHeader";
import { TxTerminal } from "@/components/TxTerminal";
import { TrialCard } from "@/components/TrialCard";
import { FundCard } from "@/components/FundCard";
import { trpc } from "@/providers/trpc";
import { SITE_ORIGIN } from "@/lib/seo";
import { ArrowUpRight, Copy, Check, Pause, Play } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";

// The WebGPU background weighs more than the rest of the page combined.
// It loads after first paint and never blocks content.
// If the chunk cannot load (offline, blocked), render no background
// rather than unmounting the page.
const Fibres = lazy(() =>
  import("@/components/Fibres")
    .then((m) => ({ default: m.Fibres }))
    .catch(() => ({ default: (() => null) as never })),
);

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is PayGate x402?",
    a: "A pay-per-call API marketplace on Arc mainnet. Sellers wrap any HTTPS endpoint with an x402 paywall and set a USDC price. Buyers and AI agents pay per call, with settlement handled on-chain by Circle's Facilitator Service.",
  },
  {
    q: "Do I need crypto experience to use it?",
    a: "No. Connect any EVM wallet, or buy USDC with a card straight to an Arc address without leaving the site. Email sign-in wallets and Apple Pay / Google Pay funding are rolling out next.",
  },
  {
    q: "How does a paid call actually work?",
    a: "The first request gets an HTTP 402 with a price. Your client signs an EIP-3009 authorisation for that exact amount and retries. PayGate verifies the signature, delivers the response, and the payment settles on Arc in under a second.",
  },
  {
    q: "What does it cost to try?",
    a: "Nothing at first. Every new wallet can claim $1 of trial credit, enough for dozens of calls against sandbox-priced endpoints. After that, each endpoint lists its own per-call price in USDC.",
  },
  {
    q: "How do sellers get paid?",
    a: "Settlement goes straight to the seller's payout wallet on Arc. There is no invoicing cycle and no minimum payout threshold: every call settles individually and can be verified on-chain.",
  },
];

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

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) setPlaying(false);
  }, []);

  useEffect(() => {
    let el = document.getElementById("ld-faq") as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "ld-faq";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
      isPartOf: { "@type": "WebPage", url: SITE_ORIGIN + "/" },
    });
  }, []);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const rows = (endpoints.data ?? []) as unknown as EndpointRow[];

  return (
    <div className="min-h-screen text-white/90 antialiased">
      <Suspense fallback={null}>
        <Fibres playing={playing} />
      </Suspense>
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
          by Circle's Facilitator Service. No accounts, no checkout: every
          call pays, and every payment is verifiable on-chain.
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

        {/* Funding: card / Apple Pay / Google Pay -> USDC on Arc */}
        <div className="mt-6">
          <FundCard />
        </div>

        {/* Built to the brief: what Circle and Arc are asking for */}
        <div className="m3e-frame mt-6 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="mono-label text-[#3B6DFF]">Built to the brief</span>
            <span className="m3e-chip">Arc mainnet · live</span>
          </div>
          <h2 className="m3-headline mt-4 text-2xl text-white">
            What Circle and Arc are asking for. What we shipped.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
            Arc is built for real deployments settling in native USDC, with
            activity that can be audited rather than asserted. PayGate is one
            of them.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Mainnet, not testnet", "Live on Arc chain 5042 today, settling real USDC through Circle's Facilitator Service."],
              ["Verified fills", "Verify-then-settle: payment is verified before the resource delivers, settled only after confirmation."],
              ["Attribution on-chain", "Every settled fill is stamped to a contract on Arc, so credit accrues to the wallet that earned it."],
              ["Auditable activity", "The terminal below reads USDC transfers straight off Arc RPC. Nothing is self-reported."],
            ].map(([t, d]) => (
              <div key={t} className="m3e-frame-soft p-4">
                <p className="mono-label text-white/35">{t}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live terminal: real USDC transfers read straight off Arc */}
        <div className="mt-10">
          <TxTerminal />
        </div>

        {/* Stats strip */}
        <div className="mt-20 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Live endpoints", value: stats.data?.endpointCount ?? "\u2014" },
            { label: "Payments settled", value: stats.data?.paymentCount ?? "\u2014" },
            {
              label: "Volume, USDC",
              value: stats.data != null ? stats.data.volumeUsdc.toFixed(2) : "\u2014",
            },
            { label: "Chain ID", value: "5042" },
          ].map((s) => (
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
                t: "Compound · next",
                d: "On the roadmap: seller float supplied to Aave V4 as USDC collateral, so payment history becomes a credit line. Not live yet; we will not claim it is until it ships.",
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
          <p className="py-10 max-w-2xl text-sm leading-relaxed text-white/50">
            The live directory loads with the marketplace ledger. Current
            listings span live crypto prices, order book depth, momentum
            signals, Arc chain status and Centrifuge RWA pool data, priced per
            call in USDC. If the list stays empty, the ledger is unreachable
            right now; the endpoints themselves still answer at
            /api/x402/&#123;slug&#125;.
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

      {/* FAQ: visible content, mirrored in FAQPage structured data */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="border-t border-white/10 pt-12">
          <span className="mono-label text-[#3B6DFF]">Questions</span>
          <h2 className="m3-headline mt-3 text-2xl text-white">
            Asked often, answered straight
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {FAQS.map((f) => (
              <div key={f.q} className="m3e-frame-soft p-6">
                <h3 className="text-[15px] font-medium tracking-tight text-white">
                  {f.q}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/45">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
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
            <span className="text-[#3B6DFF]">Every payment is on-chain.</span>
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
