import { Link, NavLink } from "react-router";

const nav = [
  { to: "/", label: "Marketplace" },
  { to: "/sell", label: "Sell" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/docs", label: "Docs" },
  { to: "/fund", label: "Fund" },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-6">
        <Link to="/" className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-base font-semibold tracking-tight text-white">
            PayGate
          </span>
          <span className="mono-label hidden text-[#3B6DFF] sm:inline">
            x402 / Arc
          </span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `mono-label transition-colors ${
                  isActive ? "text-white" : "text-white/45 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link to="/sell" className="btn-block !px-4 !py-2">
            Start selling
          </Link>
        </nav>
        <Link to="/sell" className="btn-block !px-4 !py-2 md:hidden">
          Sell
        </Link>
      </div>
      <nav className="flex gap-6 overflow-x-auto px-5 pb-3 md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `mono-label whitespace-nowrap pb-1 transition-colors ${
                isActive
                  ? "text-white border-b border-[#3B6DFF]"
                  : "text-white/45"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
