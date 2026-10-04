import { SiteHeader } from "@/components/SiteHeader";

// Client-side fallback for unknown routes. The worker answers unknown
// paths with a real 404 status and the static 404.html; this component
// only covers in-app navigation to a route that does not exist.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col text-white/90 antialiased">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-24">
        <p className="mono-label text-[#3B6DFF]">404</p>
        <h1 className="m3-headline mt-4 text-3xl text-white">
          This page is not on the ledger.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/45">
          The URL you followed does not exist. The marketplace, docs and live
          status are all one step away.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href="/" className="btn-block">
            Back to the marketplace
          </a>
          <a href="/docs" className="btn-block-ghost">
            Read the docs
          </a>
        </div>
      </main>
    </div>
  );
}
