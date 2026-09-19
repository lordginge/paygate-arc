import { useEffect, useRef, useState } from "react";
import { AppKit } from "@circle-fin/app-kit";
import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";

export default function Fund() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const kitRef = useRef<AppKit | null>(null);

  useEffect(() => {
    kitRef.current = new AppKit();
  }, []);

  const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  async function start() {
    if (!valid || !kitRef.current) return;
    const popup = window.open("", "circle-onramp");
    if (!popup) {
      setStatus("POPUP BLOCKED — ALLOW POPUPS AND RETRY");
      return;
    }
    popup.document.title = "PayGate Onramp";
    popup.document.body.style.cssText =
      "background:#050505;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh";
    popup.document.body.textContent = "MINTING SESSION…";
    setStatus("MINTING SESSION");
    try {
      const session = await kitRef.current.onramp.fetchSession({
        url: "/api/onramp/sessions",
        body: {
          appUserId: address.trim().toLowerCase(),
          destinationAddress: address.trim(),
        },
      });
      const url = (session as { widgetUrl?: string }).widgetUrl;
      if (!url) throw new Error("no widgetUrl in session");
      popup.location.href = url;
      setMounted(true);
      setStatus("WIDGET OPEN — COMPLETE THE PURCHASE IN THE POPUP");
    } catch (e) {
      popup.close();
      setStatus(e instanceof Error ? e.message.toUpperCase() : "SESSION FAILED");
    }
  }

  function stop() {
    setMounted(false);
    setStatus("");
  }

  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-5xl px-6 pt-36 pb-24">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Fund</span>
          <span className="mono-chip">Card live</span>
          <span className="mono-chip">Apple Pay soon</span>
          <span className="mono-chip">Google Pay soon</span>
        </div>

        <h1
          className="m3-display mt-10 text-white"
          style={{ fontSize: "clamp(2.4rem, 5.6vw, 4.8rem)" }}
        >
          Put USDC on Arc.
          <br />
          <span className="text-white/35">Card today. Apple Pay and Google Pay coming soon.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-white/50">
          Buyers should be one signature away from a call, not stuck funding a
          wallet. Onramp settles straight to an Arc wallet: no exchange account,
          no bridge detour, no gas token hunt.
        </p>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <section className="m3e-frame p-7">
            <p className="mono-label text-[#3B6DFF]">01 / Destination wallet</p>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… your Arc wallet address"
              spellCheck={false}
              className="m3e-input mt-5 w-full px-4 py-4 font-mono text-sm text-white placeholder:text-white/25"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={start}
                disabled={!valid}
                className="btn-block disabled:cursor-not-allowed disabled:opacity-30"
              >
                {mounted ? "RESTART" : "CONTINUE"}
              </button>
              {mounted && (
                <button onClick={stop} className="btn-block-ghost">
                  CLOSE
                </button>
              )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/35">
              Card purchase is live in the Circle onramp popup. Apple Pay and
              Google Pay are coming soon; the destination stays the same Arc USDC
              balance either way.
            </p>
            {status && <p className="mono-label mt-4 text-[#3B6DFF]">{status}</p>}
          </section>

          <section className="m3e-frame p-7">
            <p className="mono-label text-white/40">02 / Already on another chain</p>
            <p className="mt-5 text-sm leading-relaxed text-white/50">
              USDC on Ethereum, Base, Solana or 24 other networks moves to Arc
              over CCTP in under 20 seconds. Same asset for calls, same asset for
              gas, no mental swap.
            </p>
            <a
              href="https://docs.arc.io/app-kit/bridge"
              target="_blank"
              rel="noreferrer"
              className="link-line mono-label mt-6 inline-block text-white/75"
            >
              BRIDGE DOCS →
            </a>
            <div className="mt-10 border-t border-white/10 pt-6 rounded-[24px]">
              <p className="mono-label text-white/30">First-time rule</p>
              <p className="mt-3 text-sm leading-relaxed text-white/45">
                Fund once, then every endpoint is just: choose, sign, read the
                response. No accounts, no email gate, no dashboard maze.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
