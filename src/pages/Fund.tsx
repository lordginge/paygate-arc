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

  // Popup mode: the iframe variant requires an HTTPS frame-ancestor, so we
  // open the widget in a dedicated window. The window must open synchronously
  // inside the click handler (popup blockers), then we navigate it once the
  // session is minted.
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
    <div className="min-h-screen text-white/90 antialiased">
      <Fibres
        playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches}
      />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />
    <main className="relative mx-auto max-w-3xl px-6 pt-32 pb-24">
      <p className="mono-label text-[#3B6DFF]">Fund / your wallet</p>
      <h1 className="m3-headline mt-4 text-4xl md:text-5xl">
        Put USDC on Arc.
        <br />
        <span className="text-white/40">Card, Apple Pay, Google Pay.</span>
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/50">
        Buyers need USDC on Arc before their first paid call. Onramp settles
        straight to your wallet on Arc mainnet — no exchange account, no
        bridging, no gas token to source. Already hold USDC on another chain?
        Bridge it in seconds over CCTP instead.
      </p>

      <div className="mt-10 border border-white/10 bg-[#050505]/80 px-6 py-6 md:px-8">
        <p className="mono-label text-white/40">01 / DESTINATION WALLET</p>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… your Arc wallet address"
          spellCheck={false}
          className="mt-4 w-full border border-white/10 bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 focus:border-[#3B6DFF] focus:outline-none"
        />
        <div className="mt-4 flex gap-3">
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
        {status && (
          <p className="mono-label mt-4 text-[#3B6DFF]">{status}</p>
        )}
      </div>

      <div className="mt-6 border border-white/10 bg-[#050505]/80 px-6 py-6 md:px-8">
        <p className="mono-label text-white/40">02 / FROM ANOTHER CHAIN</p>
        <p className="mt-4 text-sm leading-relaxed text-white/50">
          USDC sitting on Ethereum, Base, Solana or 24 other networks moves to
          Arc over CCTP in under 20 seconds. Use Circle&apos;s Bridge Kit flow
          or the Arc bridge interface, then come back — the balance is the same
          asset you pay per call with, and the same asset gas is paid in.
        </p>
        <a
          href="https://docs.arc.io/app-kit/bridge"
          target="_blank"
          rel="noreferrer"
          className="link-line mono-label mt-4 inline-block text-white/70"
        >
          Bridge docs →
        </a>
      </div>
    </main>
    </div>
  );
}
