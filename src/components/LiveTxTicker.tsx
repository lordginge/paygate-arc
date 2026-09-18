import { trpc } from "@/providers/trpc";

const EXPLORER = "https://explorer.arc.io/tx/";

function shortHash(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function LiveTxTicker() {
  const feed = trpc.marketplace.recentPayments.useQuery(
    { limit: 1 },
    { refetchInterval: 15000 },
  );
  const latest = feed.data?.[0] as
    | {
        tx_hash: string | null;
        amount_usdc: number | string;
        created_at: string;
        endpoints?: { slug?: string; name?: string } | null;
      }
    | undefined;

  const live = Boolean(latest?.tx_hash);

  return (
    <div className="mono-label flex items-center gap-3 border border-white/10 bg-[#050505]/80 px-4 py-2.5 backdrop-blur">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
            live ? "bg-emerald-400" : "bg-white/30"
          }`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            live ? "bg-emerald-400" : "bg-white/30"
          }`}
        />
      </span>
      {live && latest ? (
        <a
          href={`${EXPLORER}${latest.tx_hash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 text-white/70 transition-colors hover:text-white"
        >
          <span className="text-emerald-400">LIVE</span>
          <span className="hidden sm:inline">
            {latest.endpoints?.name ?? "endpoint"} · $
            {Number(latest.amount_usdc).toFixed(4)}
          </span>
          <span className="text-[#3B6DFF]">{shortHash(latest.tx_hash!)}</span>
          <span className="text-white/35">{ago(latest.created_at)}</span>
        </a>
      ) : (
        <span className="text-white/40">CONNECTING TO ARC MAINNET…</span>
      )}
    </div>
  );
}
