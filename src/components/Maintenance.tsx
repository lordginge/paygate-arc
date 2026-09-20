import { SiteHeader } from "@/components/SiteHeader";
import { Fibres } from "@/components/Fibres";

export default function Maintenance({ name }: { name: string }) {
  return (
    <div className="min-h-screen text-white/90">
      <Fibres playing={!window.matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <div className="edge-fade-top" aria-hidden />
      <div className="edge-fade-bottom" aria-hidden />
      <SiteHeader />
      <main className="relative mx-auto flex min-h-[80svh] max-w-3xl flex-col items-center justify-center px-6 pt-32 pb-24 text-center">
        <span className="mono-chip text-[#3B6DFF] border-[#3B6DFF]/40">
          Under maintenance
        </span>
        <h1
          className="m3-display mt-8 text-white"
          style={{ fontSize: "clamp(2rem, 5vw, 3.6rem)" }}
        >
          {name} is being rebuilt.
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/50">
          We took this page down rather than leave something half-right in
          front of you. The marketplace and the live terminal are running.
        </p>
        <a href="/" className="btn-block mt-10">
          BACK TO THE MARKETPLACE
        </a>
      </main>
    </div>
  );
}
