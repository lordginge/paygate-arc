import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { trpc } from "@/providers/trpc";
import { useState } from "react";

const field =
  "mt-2 w-full border border-white/10 bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 focus:border-[#3B6DFF] focus:outline-none";
const label = "mono-label text-white/40";

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
      setMsg("SELLER REGISTERED — NOW LIST YOUR FIRST ENDPOINT");
    },
    onError: (e) => setMsg(`ERROR: ${e.message.toUpperCase()}`),
  });

  const utils = trpc.useUtils();
  const createEndpoint = trpc.marketplace.createEndpoint.useMutation({
    onSuccess: (row) => {
      const r = row as { slug?: string };
      setMsg(
        `ENDPOINT LIVE — ${window.location.origin}/api/x402/${r.slug ?? slug}`,
      );
      utils.marketplace.listEndpoints.invalidate();
    },
    onError: (e) => setMsg(`ERROR: ${e.message.toUpperCase()}`),
  });

  return (
    <div className="min-h-screen text-white/90 antialiased">
      <Fibres
        playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
      />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-2xl px-6 pt-32 pb-24">
        <span className="mono-label text-[#3B6DFF]">Sell</span>
        <h1
          className="m3-display mt-6 text-white"
          style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
        >
          Every endpoint,
          <br />
          a revenue line.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/50">
          Two steps: register your payout identity, then wrap an API with an
          x402 paywall priced in USDC on Arc. Registration provisions a
          dedicated Circle payout wallet, so every call settles straight to
          you.
        </p>

        {msg && (
          <p className="mono-label mt-8 border border-[#3B6DFF]/40 bg-[#3B6DFF]/10 px-4 py-3 text-[#3B6DFF]">
            {msg}
          </p>
        )}

        {/* Step 01 */}
        <section className="mt-14 border border-white/10 bg-[#050505]/80">
          <div className="flex items-baseline gap-4 border-b border-white/10 px-6 py-4 md:px-8">
            <span className="mono-label text-white/25">01</span>
            <h2 className="m3-headline text-lg text-white">
              Register as a seller
            </h2>
          </div>
          <div className="space-y-5 px-6 py-6 md:px-8">
            <div>
              <label className={label}>Arc wallet address</label>
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                spellCheck={false}
                className={field}
              />
              <p className="mono-label mt-2 text-white/25">
                Public address only. Never paste a private key.
              </p>
            </div>
            <div>
              <label className={label}>Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Acme Data Co"
                className={field}
              />
            </div>
            <button
              className="btn-block disabled:cursor-not-allowed disabled:opacity-30"
              disabled={registerSeller.isPending || !wallet || !displayName}
              onClick={() =>
                registerSeller.mutate({ walletAddress: wallet, displayName })
              }
            >
              {sellerReady ? "Registered" : "Register seller"}
            </button>
          </div>
        </section>

        {/* Step 02 */}
        <section className="mt-6 border border-white/10 bg-[#050505]/80">
          <div className="flex items-baseline gap-4 border-b border-white/10 px-6 py-4 md:px-8">
            <span className="mono-label text-white/25">02</span>
            <h2 className="m3-headline text-lg text-white">List an endpoint</h2>
          </div>
          <div className="space-y-5 px-6 py-6 md:px-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={label}>Slug</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="weather-now"
                  spellCheck={false}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Price per call (USDC)</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="number"
                  step="0.0001"
                  min="0.000001"
                  className={field}
                />
              </div>
            </div>
            <div>
              <label className={label}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Live weather lookup"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this endpoint return?"
                rows={3}
                className={field}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={label}>Category</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Upstream API URL</label>
                <input
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  placeholder="https://api.example.com/data"
                  spellCheck={false}
                  className={field}
                />
              </div>
            </div>
            <p className="mono-label text-white/25">
              Paid calls proxy to your upstream. Unpaid callers never reach it.
            </p>
            <button
              className="btn-block disabled:cursor-not-allowed disabled:opacity-30"
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
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
