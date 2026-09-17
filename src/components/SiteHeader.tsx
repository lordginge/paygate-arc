import { Link, NavLink } from "react-router";
import { Zap } from "lucide-react";

const nav = [
  { to: "/", label: "Marketplace" },
  { to: "/sell", label: "Sell" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/docs", label: "Docs" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-[#0a0f1e]/90 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white font-semibold text-lg">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
            <Zap size={18} />
          </span>
          PayGate
          <span className="text-xs font-normal text-blue-400/80 border border-blue-400/30 rounded-full px-2 py-0.5">
            x402 on Arc
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
