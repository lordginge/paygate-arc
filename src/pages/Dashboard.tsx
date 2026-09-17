import { SiteHeader } from "@/components/SiteHeader";
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

  const payments = (feed.data ?? []) as unknown as PaymentRow[];

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-bold text-white">Seller dashboard</h1>
        <p className="mt-2 text-slate-400">
          Enter your Arc wallet address to see endpoints, earnings and payment
          history.
        </p>

        <div className="mt-6 flex gap-2 max-w-xl">
          <Input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x..."
            className="bg-black/40 border-white/15 text-white"
          />
          <Button
            className="bg-blue-500 hover:bg-blue-600 text-white"
            onClick={() => setSubmitted(wallet)}
          >
            Load
          </Button>
        </div>

        {stats.data && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-white">
                    {stats.data.endpoints.length}
                  </div>
                  <div className="text-xs text-slate-400">Endpoints</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-white">
                    {stats.data.payments.length}
                  </div>
                  <div className="text-xs text-slate-400">Payments</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-4">
                  <div className="text-2xl font-semibold text-emerald-400">
                    ${stats.data.totalEarned.toFixed(4)}
                  </div>
                  <div className="text-xs text-slate-400">Earned (USDC on Arc)</div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base">Your endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">URL</TableHead>
                      <TableHead className="text-slate-400 text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.data.endpoints.map((e) => (
                      <TableRow key={e.id} className="border-white/5">
                        <TableCell className="text-white">{e.name}</TableCell>
                        <TableCell>
                          <code className="text-xs text-emerald-300">
                            /api/x402/{e.slug}
                          </code>
                        </TableCell>
                        <TableCell className="text-right text-slate-300">
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
          <p className="mt-6 text-slate-400">
            No seller found for that address. Register on the Sell page first.
          </p>
        )}

        <h2 className="mt-14 mb-4 text-xl font-semibold text-white">
          Live payment feed
        </h2>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            {payments.length === 0 && (
              <p className="text-slate-500 py-6 text-center">
                No payments settled yet.
              </p>
            )}
            {payments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-400">Endpoint</TableHead>
                    <TableHead className="text-slate-400">Payer</TableHead>
                    <TableHead className="text-slate-400 text-right">Amount</TableHead>
                    <TableHead className="text-slate-400">Tx</TableHead>
                    <TableHead className="text-slate-400">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id} className="border-white/5">
                      <TableCell className="text-white">
                        {p.endpoints?.name ?? "?"}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
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
                            className="text-blue-400 hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            {p.tx_hash.slice(0, 10)}...
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-slate-500 text-xs">pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
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
