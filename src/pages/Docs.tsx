import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto bg-black/50 border border-white/10 p-4 text-xs leading-relaxed text-emerald-200">
      {children}
    </pre>
  );
}

export default function Docs() {
  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <SiteHeader />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <div className="mx-auto max-w-3xl px-5 pt-36 pb-24 md:px-6 space-y-8">
        <div>
          <h1 className="m3-headline text-3xl text-white">How PayGate works</h1>
          <p className="mt-2 text-white/50">
            PayGate is a pay-per-call API marketplace on Arc mainnet. Every
            endpoint speaks x402 v2 with the exact scheme, settled by Circle's
            Facilitator Service in native USDC.
          </p>
        </div>

        <Card className="m3e-frame">
          <CardHeader>
            <CardTitle className="text-white text-base">For buyers and agents</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/80 space-y-3">
            <p>
              1. Call any endpoint URL. Unpaid calls return HTTP 402 with a
              base64 <code>PAYMENT-REQUIRED</code> header describing price,
              asset (USDC on Arc, chain ID 5042) and recipient.
            </p>
            <p>
              2. Sign an EIP-3009 <code>TransferWithAuthorization</code>{" "}
              against the USDC contract{" "}
              <code>0x3600000000000000000000000000000000000000</code> (domain:
              name "USDC", version "2", chainId 5042).
            </p>
            <p>
              3. Retry the request with a <code>Payment-Signature</code> header
              carrying the base64-encoded payment payload. PayGate settles via
              Circle Facilitator and proxies the call to the seller's upstream
              API. The response includes an <code>X-Payment-Receipt</code>{" "}
              header with the Arc transaction hash.
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
          </CardContent>
        </Card>

        <Card className="m3e-frame">
          <CardHeader>
            <CardTitle className="text-white text-base">For sellers</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/80 space-y-3">
            <p>
              Register on the Sell page with your Arc address, list an
              endpoint with an upstream URL and a USDC price, and share the
              generated <code>/api/x402/&lt;slug&gt;</code> URL. Unpaid traffic
              never reaches your upstream.
            </p>
            <p>
              Settlement runs through Circle Facilitator Service, so there is
              no relayer or gas wallet to operate. Payments are logged per
              endpoint and visible on your dashboard with Arc explorer links.
            </p>
            <p>
              Each seller gets a dedicated Circle developer-controlled wallet
              on Arc at registration. Endpoints settle directly to that
              wallet, and the seller proof is signed through Circle's Sign
              API, so no private key ever touches PayGate's servers. Withdraw
              to your own address any time from the dashboard.
            </p>
            <p className="text-white/35 text-xs">
              Legacy endpoints created before payout wallets settle to the
              platform treasury and are credited in the ledger.
            </p>
          </CardContent>
        </Card>

        <Card className="m3e-frame">
          <CardHeader>
            <CardTitle className="text-white text-base">
              Can x402 send tweets? Yes, as a paid upstream
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/80">
            <p>
              Wrap X's <span className="font-mono">POST /2/tweets</span> behind
              a PayGate endpoint. The seller upstream holds its own X
              credentials; PayGate never stores social keys. A buyer pays the
              exact USDC price on Arc, sends the tweet text in the request body,
              and only after payment verifies does PayGate forward the call to
              the upstream, which posts it. The same pattern covers Telegram,
              Discord webhooks, storage writes or any action API.
            </p>
            <p className="mt-3 text-xs text-white/40">
              Rule: X tokens stay in the upstream service, never in the PayGate
              listing or frontend.
            </p>
          </CardContent>
        </Card>

        <Card className="m3e-frame">
          <CardHeader>
            <CardTitle className="text-white text-base">Try the demo buyer</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/80">
            <p>
              The repo ships a buyer script that performs the full 402 flow
              against any listed endpoint using a funded Arc wallet:
            </p>
            <Code>{`BUYER_PRIVATE_KEY=0x... \\
PAYGATE_URL=https://<deployment> \\
SLUG=weather-now \\
npx tsx scripts/demo-buyer.ts`}</Code>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
