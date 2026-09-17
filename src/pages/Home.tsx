import { SiteHeader } from "@/components/SiteHeader";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Copy, Check } from "lucide-react";
import { useState } from "react";

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

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const rows = (endpoints.data ?? []) as unknown as EndpointRow[];

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
          Monetise any API.
          <br />
          <span className="text-blue-400">Paid in USDC on Arc.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-slate-400 text-lg">
          PayGate wraps any HTTP endpoint with an x402 paywall. AI agents and
          developers pay per call with USDC on Arc mainnet, settled in real
          time by Circle's Facilitator Service. Sub-cent pricing, no API keys,
          no accounts for buyers.
        </p>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Live endpoints", value: stats.data?.endpointCount ?? "..." },
            { label: "Payments settled", value: stats.data?.paymentCount ?? "..." },
            {
              label: "Volume (USDC)",
              value:
                stats.data != null ? stats.data.volumeUsdc.toFixed(2) : "...",
            },
            { label: "Network", value: "Arc mainnet" },
          ].map((s) => (
            <Card key={s.label} className="bg-white/5 border-white/10">
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-semibold text-white">{s.value}</div>
                <div className="text-xs text-slate-400 mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Endpoint directory</h2>
          <span className="text-sm text-slate-500">
            Prices are per call, settled as native USDC on Arc
          </span>
        </div>

        {endpoints.isLoading && (
          <p className="text-slate-500">Loading endpoints...</p>
        )}
        {!endpoints.isLoading && rows.length === 0 && (
          <Card className="bg-white/5 border-white/10 border-dashed">
            <CardContent className="py-10 text-center text-slate-400">
              No endpoints yet. Be the first: head to{" "}
              <a href="/sell" className="text-blue-400 underline">Sell</a> and
              wrap an API with an x402 paywall.
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((e) => (
            <Card key={e.id} className="bg-white/5 border-white/10 hover:border-blue-400/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-white text-lg">{e.name}</CardTitle>
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 shrink-0">
                    ${Number(e.price_usdc).toFixed(4)} / call
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400 min-h-[2.5rem]">
                  {e.description || "No description provided."}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline" className="border-white/15 text-slate-400">
                    {e.category}
                  </Badge>
                  <span>
                    by {e.sellers?.display_name ?? "unknown"}{" "}
                    {e.sellers?.wallet_address ? `(${shortAddr(e.sellers.wallet_address)})` : ""}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-black/40 px-3 py-2 text-xs text-emerald-300">
                    /api/x402/{e.slug}
                  </code>
                  <button
                    onClick={() => copy(`${window.location.origin}/api/x402/${e.slug}`, e.id)}
                    className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300"
                    title="Copy URL"
                  >
                    {copied === e.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <a
                    href={`/api/x402/${e.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300"
                    title="View 402 challenge"
                  >
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
