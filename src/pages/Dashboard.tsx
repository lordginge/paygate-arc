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
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-bold text-white">Seller dashboard</h1>
        <p className="mt-2 text-white/50">
          Enter your Arc wallet address to see endpoints, earnings and payment
          history.
        </p>

        <div className="mt-6 flex gap-2 max-w-xl">
          <Input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x..."
            className="bg-black/40 border-white/15 text-white rounded-none"
          />
          <Button
            className="bg-[#3B6DFF] hover:bg-[#2b57d9] rounded-none text-white"
            onClick={() => setSubmitted(wallet)}
          >
            Load
          </Button>
        </div>

        {stats.data && (
          <div className="mt-8 space-y-6">
            {stats.data.payoutAddress && (
              <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
                <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-white/50">
                      Payout wallet (Circle, settles directly per call)
                    </div>
                    <code className="text-sm text-[#3B6DFF]">
                      {stats.data.payoutAddress}
                    </code>
                    <div className="mt-1 text-xs text-white/35">
                      Balance:{" "}
                      {stats.data.payoutBalance != null
                        ? `$${stats.data.payoutBalance.toFixed(4)} USDC`
                        : "unavailable"}
                    </div>
                  </div>
                  <Button
                    className="bg-[#3B6DFF] hover:bg-[#2b57d9] rounded-none text-white"
                    disabled={
                      withdraw.isPending ||
                      !stats.data.payoutBalance ||
                      stats.data.payoutBalance <= 0
                    }
                    onClick={() => withdraw.mutate({ walletAddress: submitted })}
                  >
                    {withdraw.isPending ? "Withdrawing..." : "Withdraw to my wallet"}
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
              </Card>
            )}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-white">
                    {stats.data.endpoints.length}
                  </div>
                  <div className="text-xs text-white/50">Endpoints</div>
                </CardContent>
              </Card>
              <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-white">
                    {stats.data.payments.length}
                  </div>
                  <div className="text-xs text-white/50">Payments</div>
                </CardContent>
              </Card>
              <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-emerald-400">
                    ${stats.data.totalEarned.toFixed(4)}
                  </div>
                  <div className="text-xs text-white/50">Earned (USDC on Arc)</div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
              <CardHeader>
                <CardTitle className="text-white text-base">Your endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/50">Name</TableHead>
                      <TableHead className="text-white/50">URL</TableHead>
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
              </CardContent>
            </Card>
          </div>
        )}
        {submitted && stats.data === null && (
          <p className="mt-6 text-white/50">
            No seller found for that address. Register on the Sell page first.
          </p>
        )}

        <h2 className="mt-14 mb-4 text-xl font-semibold text-white">
          Live payment feed
        </h2>
        <Card className="bg-black/70 border-white/10 backdrop-blur-md rounded-none">
          <CardContent className="pt-4">
            {payments.length === 0 && (
              <p className="text-white/35 py-6 text-center">
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
                      <TableCell className="text-white/50 text-xs">
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
                            className="text-[#3B6DFF] hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            {p.tx_hash.slice(0, 10)}...
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-white/35 text-xs">pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-white/35 text-xs">
                        {new Date(p.created_at).toLocaleString("en-GB")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
