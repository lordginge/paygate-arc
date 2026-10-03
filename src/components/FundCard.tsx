import { useRef, useState } from "react";

// Prefill the address the visitor is already using on the site (email
// wallet session or trial wallet), so topping up is one less step.
function initialAddress(): string {
  try {
    const trial = localStorage.getItem("paygate.trialWallet");
    if (trial && /^0x[a-fA-F0-9]{40}$/.test(trial)) return trial;
  } catch {
    /* ignore */
  }
  return "";
}
import { AppKit } from "@circle-fin/app-kit";

// Funding card: buyers put USDC on Arc with a card, Apple Pay or Google Pay
// via Circle's Onramp widget. The server mints a short-lived session so the
// Circle API key never reaches the browser.
export function FundCard() {
  const [address, setAddress] = useState(initialAddress);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const kitRef = useRef<AppKit | null>(null);

  const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  async function start() {
    if (!valid || busy) return;
    if (!kitRef.current) kitRef.current = new AppKit();
    const popup = window.open("", "circle-onramp");
    if (!popup) {
      setStatus("POPUP BLOCKED — ALLOW POPUPS AND RETRY");
      return;
    }
    popup.document.title = "PayGate Onramp";
    popup.document.body.style.cssText =
      "background:#050505;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh";
    popup.document.body.textContent = "MINTING SESSION…";
    setBusy(true);
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
      setStatus("WIDGET OPEN — COMPLETE THE PURCHASE IN THE POPUP");
    } catch (e) {
      popup.close();
      setStatus(e instanceof Error ? e.message.toUpperCase() : "SESSION FAILED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m3e-frame p-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-label text-white/40">Fund a wallet</span>
        <span className="m3e-chip border-[#7CE38B]/30 text-[#7CE38B]">Card live</span>
        <span className="m3e-chip text-white/50">Apple Pay soon</span>
        <span className="m3e-chip text-white/50">Google Pay soon</span>
      </div>
      <h3 className="m3-headline mt-4 text-2xl text-white">
        Put USDC on Arc with a card.
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/45">
        Buyers should be one tap away from a call, not stuck funding a wallet.
        Onramp settles USDC straight to an Arc address: no exchange account, no
        bridge detour, no gas token hunt.
      </p>

      <div className="mt-6">
        <label className="block">
          <span className="mono-label text-white/30">Destination wallet</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x… your Arc wallet address"
            spellCheck={false}
            className="m3e-input mt-2 w-full px-4 py-4 font-mono text-sm text-white placeholder:text-white/25"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={start}
            disabled={!valid || busy}
            className="btn-block disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? "OPENING…" : "BUY USDC →"}
          </button>
          <a href="/fund" className="mono-label link-line text-white/50">
            More options
          </a>
        </div>
        {status && <p className="mono-label mt-4 text-[#3B6DFF]">{status}</p>}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-white/25">
        Card purchases are live in the Circle onramp popup. Apple Pay and
        Google Pay land as soon as provider approval clears; the destination
        stays the same Arc USDC balance either way.
      </p>
    </div>
  );
}
