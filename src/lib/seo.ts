// Per-route SEO: every page gets its own title, meta description,
// canonical URL, Open Graph tags and BreadcrumbList schema. The Seo
// component applies them on client-side navigation; the prerender step
// (scripts/prerender.mjs) captures the result so crawlers see the same
// tags in static HTML.
import { useEffect } from "react";

export const SITE_ORIGIN = "https://paygatex402.com";
export const SITE_NAME = "PayGate x402";

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  /** Visible page name used in breadcrumb schema. */
  crumb: string;
}

export const ROUTE_META: RouteMeta[] = [
  {
    path: "/",
    title: "PayGate x402 | Pay-per-call API marketplace on Arc",
    description:
      "Wrap any HTTP API with an x402 paywall. Buyers and AI agents pay per call in native USDC on Arc mainnet, settled by Circle. Sell a call, not a subscription.",
    crumb: "Home",
  },
  {
    path: "/sell",
    title: "Sell an API, get paid per call | PayGate x402",
    description:
      "Point PayGate at any HTTPS endpoint, set a USDC price and go live on Arc mainnet. Unpaid traffic never reaches your upstream. Settlement lands straight to your wallet.",
    crumb: "Sell",
  },
  {
    path: "/docs",
    title: "Docs: how x402 payments work | PayGate x402",
    description:
      "The moving pieces of an x402 paid call: 402 challenges, EIP-3009 signatures, verify-then-settle and receipts on Arc mainnet. Buyer and seller quickstarts included.",
    crumb: "Docs",
  },
  {
    path: "/fund",
    title: "Buy USDC on Arc with a card | PayGate x402",
    description:
      "Top up an Arc wallet with card, Apple Pay or Google Pay through Circle's onramp. USDC settles straight to your address: no exchange account, no bridge detour.",
    crumb: "Fund",
  },
  {
    path: "/verify",
    title: "Verify any settlement on-chain | PayGate x402",
    description:
      "Every PayGate fill is an EIP-3009 settlement on Arc mainnet. Look up any payment by wallet or transaction and check it against the chain, not our word.",
    crumb: "Verify",
  },
  {
    path: "/status",
    title: "Live infrastructure status | PayGate x402",
    description:
      "Real-time health checks for the PayGate marketplace: Arc RPC head block, settlement facilitator, marketplace ledger and the on-chain indexer, refreshed every 30 seconds.",
    crumb: "Status",
  },
  {
    path: "/dashboard",
    title: "Seller dashboard | PayGate x402",
    description:
      "Track your endpoints, paid calls and earned USDC on Arc mainnet. Every figure is read from on-chain settlements, nothing self-reported.",
    crumb: "Dashboard",
  },
  {
    path: "/legal",
    title: "Legal | PayGate x402",
    description:
      "Terms of service, privacy notice and acceptable use for the PayGate x402 marketplace on Arc mainnet.",
    crumb: "Legal",
  },
];

export function routeMeta(path: string): RouteMeta {
  return (
    ROUTE_META.find((r) => r.path === path) ??
    ROUTE_META[0]
  );
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [k, v] = selector
      .replace(/^meta\[/, "")
      .replace(/\]$/, "")
      .split("=");
    el.setAttribute(k, v.replace(/"/g, ""));
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, data: object) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/** Applies route meta to document.head. Mount once per page. Unknown
 * paths get noindex so soft-404-ish client routes stay out of search. */
export function Seo({ path }: { path: string }) {
  useEffect(() => {
    const known = ROUTE_META.some((r) => r.path === path);
    const meta = routeMeta(path);
    const url = SITE_ORIGIN + (meta.path === "/" ? "/" : meta.path);
    document.title = known ? meta.title : `Page not found | ${SITE_NAME}`;
    upsertMeta('meta[name="description"]', { content: meta.description });
    upsertMeta('meta[name="robots"]', {
      content: known ? "index, follow" : "noindex, follow",
    });
    upsertLink("canonical", url);
    upsertMeta('meta[property="og:title"]', { content: meta.title });
    upsertMeta('meta[property="og:description"]', { content: meta.description });
    upsertMeta('meta[property="og:url"]', { content: url });
    upsertMeta('meta[name="twitter:title"]', { content: meta.title });
    upsertMeta('meta[name="twitter:description"]', { content: meta.description });

    const crumbs =
      meta.path === "/" || !known
        ? [{ name: "Home", item: SITE_ORIGIN + "/" }]
        : [
            { name: "Home", item: SITE_ORIGIN + "/" },
            { name: meta.crumb, item: url },
          ];
    upsertJsonLd("ld-breadcrumbs", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    });
  }, [path]);
  return null;
}
