import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { connectArc } from "@/lib/trial";
import { signWalletProof } from "@/lib/proof";

const templates = [
  {
    label: "Data lookup",
    slug: "weather-now",
    name: "Live weather lookup",
    category: "data",
    upstreamUrl: "https://api.example.com/weather",
    price: "0.01",
    description: "Returns current weather for a city or coordinate pair.",
  },
  {
    label: "AI answer",
    slug: "ask-brief",
    name: "One-shot AI brief",
    category: "ai",
    upstreamUrl: "https://api.example.com/ask",
    price: "0.05",
    description: "Takes ?ask= and returns a short sourced answer.",
  },
  {
    label: "Fresh scrape",
    slug: "page-signal",
    name: "Page signal scrape",
    category: "web",
    upstreamUrl: "https://api.example.com/scrape",
    price: "0.02",
    description: "Fetches one public page and returns title, links and summary.",
  },
  {
    label: "Proof of call",
    slug: "proof-of-call",
    name: "Timestamped proof of call",
    category: "social",
    upstreamUrl: "https://api.example.com/proof-of-call",
    price: "0.03",
    description:
      "Locks one market call by hash and timestamp. One winner or loser post only, with explicit consent.",
  },
];

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
  const [stopLoss, setStopLoss] = useState("25");
  const [published, setPublished] = useState<{ slug: string; url: string } | null>(null);

  const registerSeller = trpc.marketplace.registerSeller.useMutation({
    onSuccess: () => {
      setSellerReady(true);
      setMsg("Seller registered. Now list the call people can buy.");
    },
    onError: (e) => setMsg(`Error: ${e.message}`),
  });

  // Registration proves wallet ownership: connect, then the wallet signs a
  // short challenge. The typed address and the connected account must match.
  async function registerWithProof() {
    try {
      const account = await connectArc();
      setWallet(account);
      const proof = await signWalletProof("register-seller", account);
      registerSeller.mutate({ walletAddress: account, displayName, ...proof });
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
  }

  const utils = trpc.useUtils();
  const createEndpoint = trpc.marketplace.createEndpoint.useMutation({
    onSuccess: (row) => {
      const r = row as { slug?: string };
      const s = r.slug ?? slug;
      const url = `${window.location.origin}/api/x402/${s}`;
      setPublished({ slug: s, url });
      setMsg(`Live now: ${url}`);
      utils.marketplace.listEndpoints.invalidate();
    },
    onError: (e) => setMsg(`Error: ${e.message}`),
  });

  function applyTemplate(t: (typeof templates)[number]) {
    setSlug(t.slug);
    setName(t.name);
    setCategory(t.category);
    setUpstreamUrl(t.upstreamUrl);
    setPrice(t.price);
    setDescription(t.description);
    setMsg(`Template loaded: ${t.label}. Replace the upstream URL with yours.`);
  }

  async function publishWithProof() {
    try {
      const account = await connectArc();
      setWallet(account);
      const proof = await signWalletProof("create-endpoint", account);
      createEndpoint.mutate({
        walletAddress: account,
        slug,
        name,
        description,
        category,
        upstreamUrl,
        priceUsdc: Number(price),
        ...proof,
      });
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-5xl px-6 pt-32 pb-24">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Sell</span>
        <h1 className="m3-display mt-8 text-white" style={{ fontSize: "clamp(2.3rem,5vw,4.4rem)" }}>
          Sell a call, not a subscription.
        </h1>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-white/50">
          You bring one HTTPS endpoint. PayGate turns it into a paid x402 call:
          buyer signs USDC on Arc, payment verifies, then PayGate forwards the
          request to your upstream. If it does not pay, it never reaches you.
          The slug works a bit like a domain name for one payable action:
          memorable, ownable and priced.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["You list", "One URL, one price, one clear promise per call."],
            ["Buyer pays", "Exact USDC amount on Arc, no account or checkout."],
            ["You receive", "Settlement to your Circle payout wallet, withdraw any time."],
          ].map(([t, d], i) => (
            <div key={t} className="m3e-frame-soft p-6">
              <p className="mono-label text-[#3B6DFF]">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-3 text-lg font-medium text-white">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{d}</p>
            </div>
          ))}
        </div>

        {msg && (
          <div className="m3e-frame-soft mt-6 border-[#3B6DFF]/30 px-5 py-4 text-sm text-[#B9CCFF]">
            {msg}
          </div>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="m3e-frame">
            <CardHeader>
              <CardTitle className="text-white">1. Payout identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-white/80">Arc wallet address</Label>
                <Input
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x..."
                  className="m3e-input mt-2 text-white"
                />
                <p className="mt-2 text-xs text-white/35">
                  Public address only. Never paste a private key here.
                </p>
              </div>
              <div>
                <Label className="text-white/80">Display name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Acme Data Co"
                  className="m3e-input mt-2 text-white"
                />
              </div>
              <Button
                className="btn-block w-full"
                disabled={registerSeller.isPending || !wallet || !displayName}
                onClick={() => void registerWithProof()}
              >
                {sellerReady ? "REGISTERED" : "REGISTER SELLER"}
              </Button>
            </CardContent>
          </Card>

          <Card className="m3e-frame">
            <CardHeader>
              <CardTitle className="text-white">2. Name your payable call</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="m3e-chip text-white/60 hover:text-white"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/80">Slug</Label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    placeholder="weather-now"
                    className="m3e-input mt-2 text-white"
                  />
                  <p className="mt-2 font-mono text-xs text-[#3B6DFF]">
                    {typeof window !== "undefined" ? window.location.origin : ""}
                    /api/x402/{slug || "your-name"}
                  </p>
                </div>
                <div>
                  <Label className="text-white/80">Price per call (USDC)</Label>
                  <Input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    type="number"
                    step="0.0001"
                    min="0.000001"
                    className="m3e-input mt-2 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-white/80">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Live weather lookup"
                  className="m3e-input mt-2 text-white"
                />
              </div>
              <div>
                <Label className="text-white/80">Buyer promise</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What exactly does one paid call return?"
                  className="m3e-input mt-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/80">Category</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="m3e-input mt-2 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/80">Stop loss reminder (USDC/day)</Label>
                  <Input
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    type="number"
                    min="0"
                    step="1"
                    className="m3e-input mt-2 text-white"
                  />
                </div>
              </div>
              <div>
                <Label className="text-white/80">Upstream HTTPS URL</Label>
                <Input
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  placeholder="https://api.example.com/data"
                  className="m3e-input mt-2 text-white"
                />
              </div>
              <p className="text-xs leading-relaxed text-white/35">
                Keep secrets in your upstream service. Stop loss is a reminder
                for your own upstream cap today; PayGate blocks unpaid traffic,
                while your service enforces spend limits. Social posting is
                possible only with explicit social login and user-granted
                posting access, so treat it as a separate consent flow, not a
                quick listing template. Never put tokens in the listing.
              </p>
              <Button
                className="btn-block w-full"
                disabled={
                  createEndpoint.isPending ||
                  !sellerReady ||
                  !slug ||
                  !name ||
                  !upstreamUrl.startsWith("https://")
                }
                onClick={() => void publishWithProof()}
              >
                PUBLISH THE CALL
              </Button>

              {published && (
                <div className="m3e-frame-soft mt-5 border-[#7CE38B]/25 p-5">
                  <p className="mono-label text-[#7CE38B]">Congratulations zone</p>
                  <p className="m3-headline mt-3 text-xl text-white">
                    {published.slug} is payable.
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-[#B9CCFF]">
                    {published.url}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-block-ghost !px-4 !py-2"
                      onClick={() => navigator.clipboard.writeText(published.url)}
                    >
                      COPY LINK
                    </button>
                    <a
                      className="btn-block-ghost !px-4 !py-2"
                      href={published.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      VIEW 402
                    </a>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-white/40">
                    Next: test one unpaid call for the 402, run one paid trial
                    call, then set your upstream stop loss reminder at ${""}
                    {stopLoss || "0"}/day so a viral buyer cannot surprise you.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
