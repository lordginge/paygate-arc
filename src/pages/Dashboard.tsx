import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { signWalletProof } from "@/lib/proof";

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

  // Withdrawal proves ownership: the connected wallet signs the challenge
  // for the address being withdrawn from, so nobody can force a payout.
  const [withdrawErr, setWithdrawErr] = useState<string | null>(null);
  async function withdrawWithProof() {
    try {
      setWithdrawErr(null);
      const proof = await signWalletProof("withdraw", submitted);
      withdraw.mutate({ walletAddress: submitted, ...proof });
    } catch (e) {
      setWithdrawErr((e as Error).message);
    }
  }

  const payments = (feed.data ?? []) as unknown as PaymentRow[];
  const paidCalls = stats.data?.payments.length ?? 0;
  const earned = stats.data?.totalEarned ?? 0;
  const avgCall = paidCalls > 0 ? earned / paidCalls : 0;
  const liveEndpoints = stats.data?.endpoints.length ?? 0;

  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-6xl px-6 pt-32 pb-24">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Dashboard</span>
        <h1 className="m3-display mt-8 text-white" style={{ fontSize: "clamp(2.2rem,4.8vw,4rem)" }}>
          Are your calls selling?
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/50">
          This page answers three things fast: money earned, paid calls served,
          and whether buyers are still hitting your endpoints. Paste the Arc
          wallet you registered with.
        </p>

        <div className="m3e-frame mt-8 flex max-w-2xl gap-3 p-3">
          <Input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x... registered seller wallet"
            className="m3e-input text-white"
          />
          <Button
            className="btn-block !px-6"
            onClick={() => setSubmitted(wallet)}
          >
            LOAD
          </Button>
        </div>

        {stats.data && (
          <div className="mt-8 space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Earned", `$${earned.toFixed(4)}`, "USDC settled on Arc"],
                ["Paid calls", String(paidCalls), "successful x402 settlements"],
                ["Avg call", `$${avgCall.toFixed(4)}`, "earned per paid call"],
                ["Live endpoints", String(liveEndpoints), "currently payable"],
              ].map(([label, value, note]) => (
                <Card key={label} className="m3e-frame-soft">
                  <CardContent className="pt-6">
                    <div className="text-3xl font-light tracking-tight text-white tabular-nums">
                      {value}
                    </div>
                    <div className="mono-label mt-3 text-white/40">{label}</div>
                    <div className="mt-1 text-xs text-white/30">{note}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {stats.data.payoutAddress && (
              <Card className="m3e-frame">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div>
                    <div className="mono-label text-white/45">
                      Payout wallet
                    </div>
                    <code className="mt-2 block text-sm text-[#3B6DFF]">
                      {stats.data.payoutAddress}
                    </code>
                    <div className="mt-2 text-xs text-white/35">
                      Balance:{" "}
                      {stats.data.payoutBalance != null
                        ? `$${stats.data.payoutBalance.toFixed(4)} USDC`
                        : "unavailable"}
                    </div>
                  </div>
                  <Button
                    className="btn-block"
                    disabled={
                      withdraw.isPending ||
                      !stats.data.payoutBalance ||
                      stats.data.payoutBalance <= 0
                    }
                    onClick={() => void withdrawWithProof()}
                  >
                    {withdraw.isPending ? "WITHDRAWING..." : "WITHDRAW"}
                  </Button>
                </CardContent>
                {withdraw.data && (
                  <CardContent className="pt-0 text-xs text-white/50">
                    Withdrawal submitted: {withdraw.data.amount.toFixed(4)} USDC
                    to {withdraw.data.to} (tx {withdraw.data.transactionId})
                  </CardContent>
                )}
                {withdraw.error && (
                  <CardContent className="pt-0 text-xs text-red-400">
                    {withdraw.error.message}
                  </CardContent>
                )}
                {withdrawErr && (
                  <CardContent className="pt-0 text-xs text-red-400">
                    {withdrawErr}
                  </CardContent>
                )}
              </Card>
            )}

            <Card className="m3e-frame">
              <CardHeader>
                <CardTitle className="text-white text-base">
                  What buyers can pay for right now
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.data.endpoints.length === 0 ? (
                  <p className="py-4 text-sm text-white/45">
                    No live endpoints yet. Go to Sell and make one payable.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-white/50">Offer</TableHead>
                        <TableHead className="text-white/50">Paid URL</TableHead>
                        <TableHead className="text-white/50 text-right">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.data.endpoints.map((e) => (
                        <TableRow key={e.id} className="border-white/5">
                          <TableCell className="text-white">{e.name}</TableCell>
                          <TableCell>
                            <code className="text-xs text-[#3B6DFF]">
                              /api/x402/{e.slug}
                            </code>
                          </TableCell>
                          <TableCell className="text-right text-white/80">
                            ${Number(e.price_usdc).toFixed(4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        {submitted && stats.data === null && (
          <p className="m3e-frame-soft mt-6 px-5 py-4 text-white/55">
            No seller found for that address. Register on Sell first, then come
            back here to watch it sell.
          </p>
        )}

        <div className="mt-14 mb-4 flex items-end justify-between">
          <div>
            <span className="mono-label text-[#3B6DFF]">Proof</span>
            <h2 className="m3-headline mt-3 text-xl text-white">
              Latest paid calls across PayGate
            </h2>
          </div>
          <span className="mono-label text-white/30">settled on Arc</span>
        </div>
        <Card className="m3e-frame">
          <CardContent className="pt-6">
            {payments.length === 0 && (
              <p className="py-6 text-center text-white/35">
                No payments settled yet.
              </p>
            )}
            {payments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-white/50">Endpoint</TableHead>
                    <TableHead className="text-white/50">Payer</TableHead>
                    <TableHead className="text-white/50 text-right">Amount</TableHead>
                    <TableHead className="text-white/50">Tx</TableHead>
                    <TableHead className="text-white/50">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id} className="border-white/5">
                      <TableCell className="text-white">
                        {p.endpoints?.name ?? "?"}
                      </TableCell>
                      <TableCell className="text-xs text-white/50">
                        {p.payer_address.slice(0, 10)}...
                      </TableCell>
                      <TableCell className="text-right text-emerald-400">
                        ${Number(p.amount_usdc).toFixed(4)}
                      </TableCell>
                      <TableCell>
                        {p.tx_hash ? (
                          <a
                            href={`https://explorer.arc.io/tx/${p.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#3B6DFF] hover:underline"
                          >
                            {p.tx_hash.slice(0, 10)}...
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-xs text-white/30">pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-white/40">
                        {new Date(p.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
