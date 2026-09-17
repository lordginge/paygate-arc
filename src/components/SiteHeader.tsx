import { Link, NavLink } from "react-router";

const nav = [
  { to: "/", label: "Marketplace" },
  { to: "/sell", label: "Sell" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/docs", label: "Docs" },
];

export function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto max-w-6xl px-6 h-20 flex items-center justify-between">
        <Link
          to="/"
          className="text-white/90 font-medium tracking-tight text-lg flex items-baseline gap-2"
        >
          PayGate
          <span className="text-[11px] uppercase tracking-[0.18em] text-[#5AB0FF]">
            x402 · Arc
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `link-line text-sm transition-colors ${
                  isActive ? "text-white" : "text-white/50 hover:text-white/90"
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
