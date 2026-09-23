const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const STAMP_CONTRACT = "0xba2ec4dceafff136dbd8d371800c0b337753c679";
const TREASURY_ADDRESS = "0x57607f9296385571CbD8Df14D8728B7CB839743D";
const STAMPER_ADDRESS = "0x47d265Dfa577C32337272b3c1737C7378eE6389D";

function shortAddr(a: string) {
  return `${a.slice(0, 8)}...${a.slice(-6)}`;
}

function Addr({ label, address }: { label: string; address: string }) {
  return (
    <div className="min-w-0">
      <p className="mono-label text-white/30">{label}</p>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(address)}
        className="mt-1 block max-w-full truncate font-mono text-[11px] text-white/50 transition-colors hover:text-[#B9CCFF]"
        title="Click to copy full address"
      >
        {shortAddr(address)}
      </button>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="mono-label text-[#3B6DFF]">PayGate x402 / Arc</p>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/40">
              Pay-per-call API marketplace on Arc mainnet (chain 5042).
              Payments settle in native USDC through Circle's Facilitator
              Service. Every settled fill is stamped on-chain. Click any
              address to copy it, then verify it on the explorer yourself.
            </p>
          </div>
          <div>
            <p className="mono-label text-white/30">On-chain</p>
            <div className="mt-3 space-y-3">
              <Addr label="USDC (EIP-3009)" address={USDC_ADDRESS} />
              <Addr label="Stamp contract" address={STAMP_CONTRACT} />
              <Addr label="Treasury" address={TREASURY_ADDRESS} />
              <Addr label="Stamper" address={STAMPER_ADDRESS} />
            </div>
          </div>
          <div>
            <p className="mono-label text-white/30">Product</p>
            <div className="mt-3 flex flex-col gap-2 text-xs">
              {[
                ["Verify a payment", "/verify"],
                ["System status", "/status"],
                ["Documentation", "/docs"],
                ["Sell a call", "/sell"],
                ["Terms and privacy", "/legal"],
                [
                  "Source (GitHub)",
                  "https://github.com/lordginge/paygate-arc",
                ],
              ].map(([label, href]) =>
                href.startsWith("http") ? (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/50 transition-colors hover:text-[#B9CCFF]"
                  >
                    {label}
                  </a>
                ) : (
                  <a
                    key={label}
                    href={href}
                    className="text-white/50 transition-colors hover:text-[#B9CCFF]"
                  >
                    {label}
                  </a>
                ),
              )}
            </div>
          </div>
        </div>
        <p className="mt-10 text-[11px] text-white/25">
          No accounts. No custody of seller funds beyond settlement. On-chain
          activity is public by design.
        </p>
      </div>
    </footer>
  );
}
