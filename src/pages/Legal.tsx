import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="m3e-frame-soft p-6">
      <h2 className="m3-headline text-lg text-white">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-white/50">{children}</div>
    </section>
  );
}

export default function Legal() {
  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-3xl px-6 pt-32 pb-24">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Legal</span>
        <h1
          className="m3-display mt-8 text-white"
          style={{ fontSize: "clamp(2rem,5vw,3.6rem)" }}
        >
          Terms and privacy
        </h1>
        <p className="mt-4 text-sm text-white/40">
          Plain English, last updated 23 September 2026. This page is the
          whole agreement; there is no separate document hidden anywhere.
        </p>

        <div className="mt-10 space-y-4">
          <Section title="The service">
            <p>
              PayGate wraps HTTP endpoints with an x402 payment gate. Buyers
              pay per call in USDC on Arc mainnet. Sellers provide upstream
              endpoints and receive settlement to their own payout wallet.
            </p>
          </Section>

          <Section title="No accounts, no custody">
            <p>
              There are no user accounts and no passwords. Your wallet
              address is your identity, and wallet ownership is proven by
              signature, not by us storing anything about you.
            </p>
            <p>
              PayGate does not take custody of seller funds beyond the
              settlement transaction itself. Payments route through Circle's
              hosted Facilitator Service directly to the payout address.
            </p>
          </Section>

          <Section title="What we store">
            <p>
              Endpoint listings (slug, price, upstream URL, seller address
              and display name) and a payment ledger (payment id, payer
              address, endpoint, transaction hash) so replays can be deduped
              and fills verified. Trial credit is tracked per wallet address.
            </p>
            <p>
              We do not track visitors, set advertising cookies, or sell
              data. The background motion honours your device's reduced
              motion setting and a pause control is on every page.
            </p>
          </Section>

          <Section title="On-chain data is public">
            <p>
              Every settlement is a public blockchain transaction. Wallet
              addresses, amounts and timestamps involved in payments are
              visible to anyone, including on this site's live terminal and
              verification page. Do not use a wallet address you want to
              keep private.
            </p>
          </Section>

          <Section title="Fair use of the service">
            <p>
              List only endpoints you control or are authorised to sell.
              Do not list endpoints that return unlawful content, personal
              data you have no right to share, or responses you cannot
              deliver. PayGate can delist endpoints that abuse buyers.
            </p>
          </Section>

          <Section title="No warranty">
            <p>
              The service is provided as is. Uptime is monitored and shown on
              the status page, but no service level is guaranteed on the free
              tier. Settlement depends on Arc and Circle's Facilitator
              Service being available. Verify any payment independently
              using the verification page before relying on it.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              The codebase is public at
              github.com/lordginge/paygate-arc. Raise an issue there for
              security reports, delisting requests or questions. Security
              issues are handled first.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
