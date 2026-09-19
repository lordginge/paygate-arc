import { Link, NavLink } from "react-router";
import { DitherMark } from "@/components/DitherMark";

const nav = [
  { to: "/", label: "Marketplace" },
  { to: "/sell", label: "Sell" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/docs", label: "Docs" },
  { to: "/fund", label: "Fund" },
];

export function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <DitherMark size={22} className="shrink-0" />
          <span className="m3-headline text-white text-base">
            PayGate
          </span>
          <span className="mono-label text-[#3B6DFF]">x402 / Arc</span>
        </Link>
        <nav className="flex items-center gap-7">
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
          <Link to="/sell" className="btn-block !py-2 !px-4 hidden sm:inline-block">
            Start selling
          </Link>
        </nav>
      </div>
    </header>
  );
}
