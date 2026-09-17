import { SiteHeader } from "@/components/SiteHeader";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export default function Sell() {
  const [wallet, setWallet] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sellerReady, setSellerReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [price, setPrice] = useState("0.01");

  const registerSeller = trpc.marketplace.registerSeller.useMutation({
    onSuccess: () => {
      setSellerReady(true);
      setMsg("Seller registered. Now list your first endpoint.");
    },
    onError: (e) => setMsg(`Error: ${e.message}`),
  });

  const utils = trpc.useUtils();
  const createEndpoint = trpc.marketplace.createEndpoint.useMutation({
    onSuccess: (row) => {
      const r = row as { slug?: string };
      setMsg(
        `Endpoint live at ${window.location.origin}/api/x402/${r.slug ?? slug}`,
      );
      utils.marketplace.listEndpoints.invalidate();
    },
    onError: (e) => setMsg(`Error: ${e.message}`),
  });

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold text-white">Sell on PayGate</h1>
        <p className="mt-2 text-slate-400">
          Two steps: register your payout identity, then wrap an API with an
          x402 paywall priced in USDC on Arc.
        </p>

        {msg && (
          <div className="mt-4 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
            {msg}
          </div>
        )}

        <Card className="mt-8 bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">1. Register as a seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Arc wallet address</Label>
              <Input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                className="mt-1 bg-black/40 border-white/15 text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Public address only. Never paste a private key here.
              </p>
            </div>
            <div>
              <Label className="text-slate-300">Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Acme Data Co"
                className="mt-1 bg-black/40 border-white/15 text-white"
              />
            </div>
            <Button
              className="bg-blue-500 hover:bg-blue-600 text-white"
              disabled={registerSeller.isPending || !wallet || !displayName}
              onClick={() =>
                registerSeller.mutate({ walletAddress: wallet, displayName })
              }
            >
              {sellerReady ? "Registered" : "Register seller"}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6 bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">2. List an endpoint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="weather-now"
                  className="mt-1 bg-black/40 border-white/15 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Price per call (USDC)</Label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="number"
                  step="0.0001"
                  min="0.000001"
                  className="mt-1 bg-black/40 border-white/15 text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Live weather lookup"
                className="mt-1 bg-black/40 border-white/15 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this endpoint return?"
                className="mt-1 bg-black/40 border-white/15 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Category</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 bg-black/40 border-white/15 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Upstream API URL</Label>
                <Input
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  placeholder="https://api.example.com/data"
                  className="mt-1 bg-black/40 border-white/15 text-white"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              PayGate proxies paid calls to your upstream URL. Keep any secret
              keys in the upstream URL or in headers your upstream requires;
              unpaid callers never reach it.
            </p>
            <Button
              className="bg-blue-500 hover:bg-blue-600 text-white"
              disabled={
                createEndpoint.isPending ||
                !sellerReady ||
                !slug ||
                !name ||
                !upstreamUrl.startsWith("https://")
              }
              onClick={() =>
                createEndpoint.mutate({
                  walletAddress: wallet,
                  slug,
                  name,
                  description,
                  category,
                  upstreamUrl,
                  priceUsdc: Number(price),
                })
              }
            >
              Create paywalled endpoint
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
