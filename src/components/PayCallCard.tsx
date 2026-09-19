import { useMemo, useState } from "react";
import { connectArc, getProvider } from "../lib/trial";
import { trpc } from "@/providers/trpc";

type Phase =
  | "idle"
  | "connecting"
  | "challenging"
  | "signing"
  | "settling"
  | "result"
  | "error";

interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

interface Challenge {
  x402Version: number;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
}

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  price_usdc: string;
}

function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" +
    Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// Real paid call from the browser: connect wallet -> 402 challenge ->
// sign a real EIP-3009 TransferWithAuthorization -> Circle settles on Arc.
// Real USDC moves; this is the same flow as scripts/demo-buyer.ts.
export function PayCallCard({
  slug,
  onSlugChange,
}: {
  slug: string | null;
  onSlugChange: (slug: string) => void;
}) {
  const endpoints = trpc.marketplace.listEndpoints.useQuery();
  const rows = useMemo(
    () => (endpoints.data ?? []) as unknown as EndpointRow[],
    [endpoints.data],
  );
  const active = rows.find((r) => r.slug === slug) ?? rows[0] ?? null;

  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [tx, setTx] = useState<{ hash: string | null; explorer: string | null }>({
    hash: null,
    explorer: null,
  });
  const [paidAmount, setPaidAmount] = useState<string>("");

  const busy =
    phase === "connecting" ||
    phase === "challenging" ||
    phase === "signing" ||
    phase === "settling";

  const payAndCall = async () => {
    if (!active) return;
    setError("");
    setResult("");
    setTx({ hash: null, explorer: null });
    try {
      // 1) wallet on Arc
      setPhase("connecting");
      const w = wallet ?? (await connectArc());
      setWallet(w);
      const eth = getProvider();
      if (!eth) throw new Error("No wallet found");

      // 2) unpaid request -> 402 challenge
      setPhase("challenging");
      const url = `/api/x402/${active.slug}`;
      const unpaid = await fetch(url);
      if (unpaid.status !== 402) {
        throw new Error(`Expected a 402 challenge, got HTTP ${unpaid.status}`);
      }
      const challenge = (await unpaid.json()) as Challenge;
      const req = challenge.accepts[0];
      const chainId = Number(req.network.split(":")[1]);

      // 3) sign the EIP-3009 authorisation (real value)
      setPhase("signing");
      const validBefore = String(Math.floor(Date.now() / 1000) + 3600);
      const authorization = {
        from: w,
        to: req.payTo,
        value: req.amount,
        validAfter: "0",
        validBefore,
        nonce: randomNonce(),
      };
      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        domain: {
          name: req.extra.name,
          version: req.extra.version,
          chainId,
          verifyingContract: req.asset,
        },
        message: authorization,
      };
      const signature = (await eth.request({
        method: "eth_signTypedData_v4",
        params: [w, JSON.stringify(typedData)],
      })) as string;

      // 4) retry with payment -> facilitator settles on Arc
      setPhase("settling");
      const paymentPayload = {
        x402Version: 2,
        resource: challenge.resource,
        accepted: req,
        payload: { signature, authorization },
      };
      const paid = await fetch(url, {
        headers: {
          "Payment-Signature": btoa(JSON.stringify(paymentPayload)),
        },
      });
      if (!paid.ok) {
        const body = await paid.text();
        throw new Error(
          `Payment rejected (HTTP ${paid.status}): ${body.slice(0, 200)}`,
        );
      }
      const receiptRaw = paid.headers.get("x-payment-receipt");
      if (receiptRaw) {
        try {
          const receipt = JSON.parse(receiptRaw) as {
            amount?: string;
            transaction?: string | null;
            explorer?: string | null;
          };
          setTx({
            hash: receipt.transaction ?? null,
            explorer: receipt.explorer ?? null,
          });
          if (receipt.amount) setPaidAmount(receipt.amount);
        } catch {
          /* receipt is best-effort */
        }
      }
      const text = await paid.text();
      try {
        setResult(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResult(text);
      }
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const stepLabel = (done: boolean, activeStep: boolean, label: string) => (
    <span
      className={`mono-label ${
        done ? "text-[#7CE38B]" : activeStep ? "text-[#3B6DFF]" : "text-white/25"
      }`}
    >
      {done ? "\u2713 " : ""}
      {label}
    </span>
  );

  const steps: { label: string; done: boolean; activeStep: boolean }[] = [
    {
      label: "Connect wallet",
      done: wallet != null && phase !== "idle" && phase !== "connecting",
      activeStep: phase === "connecting",
    },
    {
      label: "402 challenge",
      done: ["signing", "settling", "result"].includes(phase),
      activeStep: phase === "challenging",
    },
    {
      label: "Sign payment",
      done: ["settling", "result"].includes(phase),
      activeStep: phase === "signing",
    },
    {
      label: "Settle on Arc",
      done: phase === "result",
      activeStep: phase === "settling",
    },
  ];

  return (
    <div className="max-w-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <span className="mono-label text-[#3B6DFF]">Pay &amp; call</span>
        {wallet && (
          <span className="mono-label text-white/50">
            {wallet.slice(0, 6)}&hellip;{wallet.slice(-4)}
          </span>
        )}
      </div>

      <div className="px-5 py-5">
        {phase !== "result" && (
          <>
            <p className="text-[13px] leading-relaxed text-white/50">
              The real thing, no terminal. Pick an endpoint, connect your wallet
              and sign &mdash; <span className="text-white">real USDC</span> settles
              on Arc in seconds and the response lands right here.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select
                value={active?.slug ?? ""}
                onChange={(e) => onSlugChange(e.target.value)}
                disabled={busy || rows.length === 0}
                className="w-full border border-white/10 bg-transparent px-3 py-2.5 font-mono text-[12px] text-white/80 focus:border-[#3B6DFF] focus:outline-none disabled:opacity-40 [&>option]:bg-[#050505]"
              >
                {rows.length === 0 && <option value="">Loading endpoints…</option>}
                {rows.map((r) => (
                  <option key={r.id} value={r.slug}>
                    {r.name} · ${Number(r.price_usdc).toFixed(4)}
                  </option>
                ))}
              </select>
              <button
                onClick={payAndCall}
                disabled={busy || !active}
                className="btn-block whitespace-nowrap disabled:opacity-40"
              >
                {phase === "connecting"
                  ? "Connect wallet\u2026"
                  : phase === "challenging"
                    ? "Getting 402\u2026"
                    : phase === "signing"
                      ? "Sign in wallet\u2026"
                      : phase === "settling"
                        ? "Settling\u2026"
                        : active
                          ? `Pay $${Number(active.price_usdc).toFixed(4)} & call`
                          : "Pay & call"}
              </button>
            </div>

            {(phase !== "idle" || wallet) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {steps.map((s) => (
                  <span key={s.label}>
                    {stepLabel(s.done, s.activeStep, s.label)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {phase === "result" && (
          <>
            <div className="flex items-center justify-between">
              <div className="mono-label text-[#7CE38B]">
                Paid{" "}
                {paidAmount ? `$${(Number(paidAmount) / 1e6).toFixed(4)} ` : ""}
                &middot; settled on Arc
              </div>
              {tx.explorer && (
                <a
                  href={tx.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="mono-label link-line text-[#3B6DFF]"
                >
                  View tx &nearr;
                </a>
              )}
            </div>
            <pre className="mt-3 max-h-56 overflow-auto border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-[#7CE38B]">
              {result}
            </pre>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={payAndCall}
                disabled={busy}
                className="btn-block-ghost disabled:opacity-40"
              >
                Call again
              </button>
              <button onClick={() => setPhase("idle")} className="btn-block-ghost">
                Back
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <div className="mt-3 text-[12px] text-[#FF7A7A]">{error}</div>
        )}
      </div>
    </div>
  );
}
