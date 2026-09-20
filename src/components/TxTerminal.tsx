import { useEffect, useRef, useState } from "react";

interface FeedRow {
  block: number;
  tx: string;
  from: string;
  to: string;
  usdc: number;
  paygate: boolean;
}

const EXPLORER = "https://explorer.arc.io/tx/";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function TxTerminal() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [live, setLive] = useState(false);
  const [latestBlock, setLatestBlock] = useState<number>(0);
  const afterRef = useRef(0);
  const seenRef = useRef(new Set<string>());
  const boxRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let dead = false;
    async function tick() {
      try {
        const res = await fetch(`/api/data/arc/usdc-feed?after=${afterRef.current}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { latest: number; rows: FeedRow[] };
        if (dead) return;
        setLatestBlock(data.latest);
        setLive(true);
        const fresh = data.rows.filter((r) => !seenRef.current.has(r.tx));
        if (fresh.length > 0) {
          for (const r of fresh) seenRef.current.add(r.tx);
          afterRef.current = Math.max(...data.rows.map((r) => r.block));
          setRows((prev) => [...prev, ...fresh].slice(-40));
        } else if (afterRef.current === 0) {
          afterRef.current = data.latest;
        }
      } catch {
        if (!dead) setLive(false);
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!paused && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [rows, paused]);

  return (
    <div className="m3e-frame overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                live ? "bg-emerald-400" : "bg-[#E5484D]"
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                live ? "bg-emerald-400" : "bg-[#E5484D]"
              }`}
            />
          </span>
          <span className="mono-label text-white/50">
            arc mainnet · usdc transfers · real time
          </span>
        </div>
        <span className="mono-label text-white/30">
          block {latestBlock || "…"}
        </span>
      </div>
      <div
        ref={boxRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="h-72 overflow-y-auto px-5 py-4 font-mono text-[11px] leading-relaxed md:text-xs"
      >
        {rows.length === 0 && (
          <p className="text-white/30">
            {live ? "waiting for transfers…" : "connecting to arc mainnet…"}
          </p>
        )}
        {rows.map((r) => (
          <a
            key={r.tx}
            href={`${EXPLORER}${r.tx}`}
            target="_blank"
            rel="noreferrer"
            className={`block truncate transition-colors ${
              r.paygate
                ? "text-[#3B6DFF] hover:text-white"
                : "text-white/55 hover:text-white"
            }`}
          >
            <span className="text-white/25">{r.block}</span>
            {"  "}
            {short(r.from)} → {short(r.to)}
            {"  "}
            <span className={r.paygate ? "text-[#7CE38B]" : "text-white/80"}>
              {r.usdc.toFixed(r.usdc < 0.01 ? 6 : 2)} USDC
            </span>
            {r.paygate && <span className="text-[#3B6DFF]">  · paygate</span>}
          </a>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-2.5">
        <span className="mono-label text-white/25">
          every row is a real on-chain transfer · click to verify on explorer
        </span>
      </div>
    </div>
  );
}
