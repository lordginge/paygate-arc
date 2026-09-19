import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { trpc } from "@/providers/trpc";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

interface PaymentRow {
  id: string;
  payer_address: string;
  amount_usdc: string;
  tx_hash: string | null;
  created_at: string;
  endpoints?: { slug: string; name: string } | null;
}

export default function Dashboard() {
  const [wallet, setWallet] = useState("");
  const [submitted, setSubmitted] = useState("");

  const stats = trpc.marketplace.sellerStats.useQuery(
    { walletAddress: submitted },
    { enabled: /^0x[a-fA-F0-9]{40}$/.test(submitted) },
  );
  const feed = trpc.marketplace.recentPayments.useQuery({ limit: 25 });
  const utils = trpc.useUtils();
  const withdraw = trpc.marketplace.withdraw.useMutation({
    onSuccess: () => utils.marketplace.sellerStats.invalidate(),
  });

  const payments = (feed.data ?? []) as unknown as PaymentRow[];

  return (
    <div className="min-h-screen text-white/90 antialiased">
      <Fibres
        playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
      />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-6xl px-6 pt-32 pb-24">
        <span className="mono-label text-[#3B6DFF]">Dashboard</span>
        <h1
          className="m3-display mt-6 text-white"
          style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
        >
          Your ledger.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/50">
          Enter your Arc wallet address to see endpoints, earnings and payment
          history.
        </p>

        <div className="mt-10 flex max-w-xl gap-3">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x..."
            spellCheck={false}
            className="w-full border border-white/10 bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 focus:border-[#3B6DFF] focus:outline-none"
          />
          <button className="btn-block" onClick={() => setSubmitted(wallet)}>
            Load
          </button>
        </div>

        {stats.data && (
          <div className="mt-14 space-y-6">
            {stats.data.payoutAddress && (
              <section className="border border-white/10 bg-[#050505]/80 px-6 py-6 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div>
                    <div className="mono-label text-white/40">
                      Payout wallet / Circle, settles per call
                    </div>
                    <code className="mt-3 block font-mono text-sm text-[#3B6DFF]">
                      {stats.data.payoutAddress}
                    </code>
                    <div className="mono-label mt-2 text-white/30">
                      Balance:{" "}
                      {stats.data.payoutBalance != null
                        ? `$${stats.data.payoutBalance.toFixed(4)} USDC`
                        : "unavailable"}
                    </div>
                  </div>
                  <button
                    className="btn-block disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={
                      withdraw.isPending ||
                      !stats.data.payoutBalance ||
                      stats.data.payoutBalance <= 0
                    }
                    onClick={() => withdraw.mutate({ walletAddress: submitted })}
                  >
                    {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
                  </button>
                </div>
                {withdraw.data && (
                  <p className="mono-label mt-4 text-[#7CE38B]">
                    Withdrawal submitted — {withdraw.data.amount.toFixed(4)}{" "}
                    USDC to {withdraw.data.to} (tx{" "}
                    {withdraw.data.transactionId})
                  </p>
                )}
                {withdraw.error && (
                  <p className="mono-label mt-4 text-red-400">
                    {withdraw.error.message}
                  </p>
                )}
              </section>
            )}

            {/* Stats strip, same idiom as the landing hero */}
            <div className="grid grid-cols-1 border border-white/10 sm:grid-cols-3">
              {[
                { label: "Endpoints", value: stats.data.endpoints.length },
                { label: "Payments", value: stats.data.payments.length },
                {
                  label: "Earned, USDC",
                  value: `$${stats.data.totalEarned.toFixed(4)}`,
                },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={`px-6 py-6 ${i > 0 ? "border-t border-white/10 sm:border-t-0 sm:border-l" : ""}`}
                >
                  <div className="text-3xl font-light tracking-tight text-white tabular-nums">
                    {s.value}
                  </div>
                  <div className="mono-label mt-2 text-white/35">{s.label}</div>
                </div>
              ))}
            </div>

            <section className="border border-white/10 bg-[#050505]/80">
              <div className="flex items-baseline gap-4 border-b border-white/10 px-6 py-4 md:px-8">
                <span className="mono-label text-white/25">01</span>
                <h2 className="m3-headline text-lg text-white">
                  Your endpoints
                </h2>
              </div>
              <div className="overflow-x-auto px-6 py-4 md:px-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="mono-label py-3 text-left font-normal text-white/35">
                        Name
                      </th>
                      <th className="mono-label py-3 text-left font-normal text-white/35">
                        URL
                      </th>
                      <th className="mono-label py-3 text-right font-normal text-white/35">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data.endpoints.map((e) => (
                      <tr key={e.id} className="border-b border-white/5">
                        <td className="py-3.5 text-white">{e.name}</td>
                        <td className="py-3.5">
                          <code className="font-mono text-xs text-[#3B6DFF]">
                            /api/x402/{e.slug}
                          </code>
                        </td>
                        <td className="py-3.5 text-right text-white/80 tabular-nums">
                          ${Number(e.price_usdc).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        {submitted && stats.data === null && (
          <p className="mono-label mt-10 text-white/40">
            No seller found for that address. Register on the Sell page first.
          </p>
        )}

        <div className="mt-20 mb-6 flex items-baseline justify-between border-t border-white/10 pt-12">
          <div>
            <span className="mono-label text-[#3B6DFF]">Live</span>
            <h2 className="m3-headline mt-3 text-2xl text-white">
              Payment feed
            </h2>
          </div>
          <span className="mono-label text-white/30">Settled on Arc</span>
        </div>

        <section className="border border-white/10 bg-[#050505]/80">
          <div className="overflow-x-auto px-6 py-4 md:px-8">
            {payments.length === 0 && (
              <p className="mono-label py-8 text-center text-white/30">
                No payments settled yet.
              </p>
            )}
            {payments.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="mono-label py-3 text-left font-normal text-white/35">
                      Endpoint
                    </th>
                    <th className="mono-label py-3 text-left font-normal text-white/35">
                      Payer
                    </th>
                    <th className="mono-label py-3 text-right font-normal text-white/35">
                      Amount
                    </th>
                    <th className="mono-label py-3 text-left font-normal text-white/35">
                      Tx
                    </th>
                    <th className="mono-label py-3 text-left font-normal text-white/35">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-3.5 text-white">
                        {p.endpoints?.name ?? "?"}
                      </td>
                      <td className="py-3.5 font-mono text-xs text-white/50">
                        {p.payer_address.slice(0, 10)}...
                      </td>
                      <td className="py-3.5 text-right text-[#7CE38B] tabular-nums">
                        ${Number(p.amount_usdc).toFixed(4)}
                      </td>
                      <td className="py-3.5">
                        {p.tx_hash ? (
                          <a
                            href={`https://explorer.arc.io/tx/${p.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-[#3B6DFF] hover:underline"
                          >
                            {p.tx_hash.slice(0, 10)}...
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="mono-label text-white/30">
                            pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 font-mono text-xs text-white/35">
                        {new Date(p.created_at).toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
