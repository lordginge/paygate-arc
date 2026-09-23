import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";
import { useEffect, useState } from "react";

type StatusBody = {
  generatedAt: string;
  checks: { name: string; ok: boolean; detail: string }[];
};

export default function Status() {
  const [body, setBody] = useState<StatusBody | null>(null);
  const [gatewayProbe, setGatewayProbe] = useState<"ok" | "fail" | "pending">("pending");
  const [err, setErr] = useState("");

  async function refresh() {
    setErr("");
    setGatewayProbe("pending");
    try {
      const r = await fetch("/api/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      setBody((await r.json()) as StatusBody);
    } catch (e) {
      setErr((e as Error).message);
    }
    // Page-level probe: a known paid route must answer a 402 challenge.
    try {
      const r = await fetch("/api/x402/guide-1-moving-pieces");
      setGatewayProbe(r.status === 402 ? "ok" : "fail");
    } catch {
      setGatewayProbe("fail");
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, []);

  const allOk =
    gatewayProbe === "ok" && !!body && body.checks.every((c) => c.ok);

  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />

      <main className="relative mx-auto max-w-4xl px-6 pt-32 pb-24">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">Status</span>
        <h1
          className="m3-display mt-8 text-white"
          style={{ fontSize: "clamp(2rem,5vw,3.8rem)" }}
        >
          System status
        </h1>
        <p className="mt-4 text-[15px] text-white/50">
          Every check below is a live, read-only probe. Nothing on this page
          is cached longer than 30 seconds.{" "}
          {body && (
            <span className="text-white/30">
              Last refreshed {new Date(body.generatedAt).toLocaleTimeString()}.
            </span>
          )}
        </p>

        <div className="m3e-frame mt-10 p-6">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                allOk ? "bg-[#7CE38B]" : "bg-[#FFB020]"
              }`}
            />
            <p className="text-lg font-medium text-white">
              {allOk ? "All systems operational" : "Degraded or probing"}
            </p>
          </div>

          {err && <p className="mt-4 text-sm text-[#FF8A8A]">Status feed error: {err}</p>}

          <div className="mt-6 divide-y divide-white/5">
            {(body?.checks ?? []).map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm text-white/80">{c.name}</p>
                  <p className="text-xs text-white/35">{c.detail}</p>
                </div>
                <span className={c.ok ? "mono-label text-[#7CE38B]" : "mono-label text-[#FF8A8A]"}>
                  {c.ok ? "OPERATIONAL" : "DEGRADED"}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm text-white/80">x402 challenge probe</p>
                <p className="text-xs text-white/35">
                  A known paid route must return HTTP 402 Payment Required.
                </p>
              </div>
              <span
                className={
                  gatewayProbe === "ok"
                    ? "mono-label text-[#7CE38B]"
                    : gatewayProbe === "fail"
                      ? "mono-label text-[#FF8A8A]"
                      : "mono-label text-white/40"
                }
              >
                {gatewayProbe === "ok" ? "OPERATIONAL" : gatewayProbe === "fail" ? "DEGRADED" : "PROBING"}
              </span>
            </div>
          </div>
        </div>

        <div className="m3e-frame-soft mt-6 p-6 text-xs leading-relaxed text-white/40">
          <p className="mono-label mb-2 text-white/30">Service expectations</p>
          Gateway challenge and settlement routes are monitored
          continuously with a 30-second check cadence. Settlement depends on
          Circle's hosted Facilitator Service; Arc has deterministic
          finality, so confirmed fills do not reorganise. If a check fails,
          retry after 60 seconds before treating it as an incident, then
          verify independently on the{" "}
          <a href="/verify" className="text-[#B9CCFF] hover:underline">
            verification page
          </a>
          .
        </div>
      </main>
    </div>
  );
}
