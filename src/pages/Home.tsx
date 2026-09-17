import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
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
        className="fixed bottom-6 right-6 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#050617]/60 text-white/40 backdrop-blur transition-colors hover:border-white/25 hover:text-white/90"
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>

      {/* Statement hero */}
      <section className="relative mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center px-6 pt-24 pb-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#5AB0FF]">
          x402 &middot; Arc mainnet &middot; USDC
        </p>
        <h1
          className="mt-6 max-w-4xl font-light text-white"
          style={{
            fontSize: "clamp(2rem, 4.2vw, 3.75rem)",
            letterSpacing: "-0.035em",
            lineHeight: 1.08,
          }}
        >
          Monetise any API.
          <br />
          Paid in USDC on Arc.
        </h1>
        <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-white/50">
          PayGate wraps any HTTP endpoint with an x402 paywall. Agents and
          developers pay per call in native USDC, settled in real time by
          Circle&rsquo;s Facilitator Service. Sub-cent pricing. No accounts for
          buyers.
        </p>

        {/* Stats: hairline dividers, no cards */}
        <div className="mt-16 grid grid-cols-2 gap-y-8 border-t border-white/10 pt-8 md:grid-cols-4">
          {[
            { label: "Live endpoints", value: stats.data?.endpointCount ?? "\u2014" },
            { label: "Payments settled", value: stats.data?.paymentCount ?? "\u2014" },
            {
              label: "Volume, USDC",
              value: stats.data != null ? stats.data.volumeUsdc.toFixed(2) : "\u2014",
            },
            { label: "Network", value: "Arc" },
          ].map((s) => (
            <div key={s.label} className="pr-6 md:border-l md:border-white/10 md:pl-6 md:first:border-l-0 md:first:pl-0">
              <div className="text-2xl font-light tracking-tight text-white">{s.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Directory */}
      <section className="relative mx-auto max-w-6xl px-6 pb-28">
        <div className="mb-2 flex items-baseline justify-between border-t border-white/10 pt-10">
          <h2 className="text-lg font-light tracking-tight text-white">
            Endpoint directory
          </h2>
          <span className="text-xs text-white/35">
            Per call, settled as native USDC on Arc
          </span>
        </div>

        {endpoints.isLoading && (
          <p className="py-10 text-sm text-white/35">Loading endpoints…</p>
        )}
        {!endpoints.isLoading && rows.length === 0 && (
          <p className="py-10 text-sm text-white/50">
            No endpoints yet. Be the first:{" "}
            <a href="/sell" className="link-line text-[#5AB0FF]">
              sell an API
            </a>
            .
          </p>
        )}

        <div>
          {rows.map((e) => (
            <div
              key={e.id}
              className="group grid gap-3 border-b border-white/10 py-6 md:grid-cols-[1fr_auto] md:items-center md:gap-8"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="text-[17px] font-normal tracking-tight text-white">
                    {e.name}
                  </h3>
                  <span className="text-xs uppercase tracking-[0.14em] text-white/30">
                    {e.category}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/45">
                  {e.description || "No description provided."}
                </p>
                <p className="mt-2 text-xs text-white/30">
                  by {e.sellers?.display_name ?? "unknown"}
                  {e.sellers?.wallet_address
                    ? ` · ${shortAddr(e.sellers.wallet_address)}`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-2">
                <span className="whitespace-nowrap text-[15px] font-light tabular-nums text-[#5AB0FF]">
                  ${Number(e.price_usdc).toFixed(4)}
                  <span className="ml-1 text-xs text-white/35">/ call</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <code className="truncate rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/60">
                    /api/x402/{e.slug}
                  </code>
                  <button
                    onClick={() =>
                      copy(`${window.location.origin}/api/x402/${e.slug}`, e.id)
                    }
                    className="p-1.5 text-white/40 transition-colors hover:text-white/90"
                    title="Copy URL"
                  >
                    {copied === e.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <a
                    href={`/api/x402/${e.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-white/40 transition-colors hover:text-white/90"
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
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="border-t border-white/10 pt-14">
          <p
            className="max-w-3xl font-light text-white"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            One header. One signature.{" "}
            <span className="text-[#5AB0FF]">Payment settled on-chain.</span>
          </p>
          <div className="mt-8 flex gap-8 text-sm">
            <a href="/sell" className="link-line text-white/80">
              Sell an API
            </a>
            <a href="/docs" className="link-line text-white/80">
              Read the docs
            </a>
            <a
              href="https://github.com/lordginge/paygate-arc"
              target="_blank"
              rel="noreferrer"
              className="link-line text-white/80"
            >
              Source
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
