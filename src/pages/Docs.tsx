import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto border border-white/10 bg-white/[0.03] p-5 font-mono text-xs leading-relaxed text-[#7CE38B]/90">
      {children}
    </pre>
  );
}

function Panel({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/10 bg-[#050505]/80">
      <div className="flex items-baseline gap-4 border-b border-white/10 px-6 py-4 md:px-8">
        <span className="mono-label text-white/25">{n}</span>
        <h2 className="m3-headline text-lg text-white">{title}</h2>
      </div>
      <div className="space-y-4 px-6 py-6 text-sm leading-relaxed text-white/50 md:px-8">
        {children}
      </div>
    </section>
  );
}

export default function Docs() {
  return (
    <div className="min-h-screen text-white/90 antialiased">
      <Fibres
        playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
      />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-3xl px-6 pt-32 pb-24">
        <span className="mono-label text-[#3B6DFF]">Docs</span>
        <h1
          className="m3-display mt-6 text-white"
          style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
        >
          How PayGate works.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/50">
          A pay-per-call API marketplace on Arc mainnet. Every endpoint speaks
          x402 v2 with the exact scheme, settled by Circle&rsquo;s Facilitator
          Service in native USDC.
        </p>

        <div className="mt-14 space-y-6">
          <Panel n="01" title="For buyers and agents">
            <p>
              1. Call any endpoint URL. Unpaid calls return HTTP 402 with a
              base64 <code className="text-white/80">PAYMENT-REQUIRED</code>{" "}
              header describing price, asset (USDC on Arc, chain ID 5042) and
              recipient.
            </p>
            <p>
              2. Sign an EIP-3009{" "}
              <code className="text-white/80">TransferWithAuthorization</code>{" "}
              against the USDC contract{" "}
              <code className="text-white/80">
                0x3600000000000000000000000000000000000000
              </code>{" "}
              (domain: name &ldquo;USDC&rdquo;, version &ldquo;2&rdquo;, chainId
              5042).
            </p>
            <p>
              3. Retry the request with a{" "}
              <code className="text-white/80">Payment-Signature</code> header
              carrying the base64-encoded payment payload. PayGate settles via
              Circle Facilitator and proxies the call to the seller&rsquo;s
              upstream API. The response includes an{" "}
              <code className="text-white/80">X-Payment-Receipt</code> header
              with the Arc transaction hash.
            </p>
            <Code>{`// 402 challenge (decoded)
{
  "x402Version": 2,
  "resource": { "url": ".../api/x402/weather-now", ... },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:5042",
    "amount": "10000",            // 0.01 USDC, 6 decimals
    "asset": "0x3600...0000",     // USDC on Arc
    "payTo": "0xTreasury...",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2",
               "assetTransferMethod": "eip3009" }
  }]
}`}</Code>
          </Panel>

          <Panel n="02" title="For sellers">
            <p>
              Register on the Sell page with your Arc address, list an endpoint
              with an upstream URL and a USDC price, and share the generated{" "}
              <code className="text-white/80">/api/x402/&lt;slug&gt;</code> URL.
              Unpaid traffic never reaches your upstream.
            </p>
            <p>
              Settlement runs through Circle Facilitator Service, so there is no
              relayer or gas wallet to operate. Payments are logged per endpoint
              and visible on your dashboard with Arc explorer links.
            </p>
            <p>
              Each seller gets a dedicated Circle developer-controlled wallet on
              Arc at registration. Endpoints settle directly to that wallet, and
              the seller proof is signed through Circle&rsquo;s Sign API, so no
              private key ever touches PayGate&rsquo;s servers. Withdraw to your
              own address any time from the dashboard.
            </p>
            <p className="mono-label text-white/30">
              Legacy endpoints settle to the platform treasury and are credited
              in the ledger.
            </p>
          </Panel>

          <Panel n="03" title="Try it in your browser">
            <p>
              No terminal needed. On the home page, the{" "}
              <span className="text-white">Pay &amp; call</span> card runs the
              whole flow for you: connect a wallet with USDC on Arc, pick an
              endpoint, sign one authorisation, and the response plus Arc
              transaction link appear in place. The free trial next to it does
              the same motion with credit, so no funds move.
            </p>
            <p>
              Prefer code? The repo ships a buyer script that performs the full
              402 flow against any listed endpoint using a funded Arc wallet:
            </p>
            <Code>{`BUYER_PRIVATE_KEY=0x... \\
PAYGATE_URL=https://paygatex402.com \\
SLUG=weather-now \\
npx tsx scripts/demo-buyer.ts`}</Code>
          </Panel>
        </div>
      </main>
    </div>
  );
}
