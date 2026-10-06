// Upstream URL safety for seller-registered endpoints.
//
// The x402 gateway fetches whatever URL a seller registers (after a probe),
// which makes it a server-side request forgery surface: without checks a
// seller could point the Worker at internal networks, cloud metadata
// endpoints, or localhost services reachable from the runtime. Every
// external upstream URL passes through assertSafeUpstreamUrl before fetch,
// at both registration time (marketplace.createEndpoint) and fetch time
// (gateway.fetchUpstream).
//
// DNS note: Workers has no arbitrary DNS API, so hostname-to-IP resolution
// uses DNS-over-HTTPS (Cloudflare). Failure to resolve is treated as
// unsafe: fail closed.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return -1;
    return Number(p);
  });
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return nums;
}

// Returns true when an IPv4 address is non-public: loopback, RFC1918,
// link-local, CGNAT, unspecified, broadcast, multicast, or reserved.
function isBlockedIPv4(nums: number[]): boolean {
  const [a, b] = nums;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && nums[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && nums[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && nums[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && nums[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  // IPv4-mapped ::ffff:a.b.c.d
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const nums = parseIPv4(mapped[1]);
    return !nums || isBlockedIPv4(nums);
  }
  return false;
}

async function resolveA(hostname: string): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    },
  );
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
  return (data.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
}

export class UnsafeUpstreamError extends Error {}

/**
 * Throws UnsafeUpstreamError unless `rawUrl` is a public https URL whose
 * hostname resolves only to public IPs. Call before ANY fetch of a
 * seller-controlled URL.
 */
export async function assertSafeUpstreamUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUpstreamError("upstream URL is not parseable");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUpstreamError("upstream URL must be https");
  }
  if (url.username || url.password) {
    throw new UnsafeUpstreamError("upstream URL must not carry credentials");
  }
  const port = url.port ? Number(url.port) : 443;
  if (port !== 443) {
    throw new UnsafeUpstreamError("upstream URL must use port 443");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUpstreamError("upstream hostname is not allowed");
  }

  // Literal IP in the URL: check directly, no DNS needed.
  const v4 = parseIPv4(host);
  if (v4) {
    if (isBlockedIPv4(v4)) throw new UnsafeUpstreamError("upstream IP is not public");
    return url;
  }
  const v6match = host.match(/^\[(.+)\]$/);
  if (v6match) {
    if (isBlockedIPv6(v6match[1])) throw new UnsafeUpstreamError("upstream IP is not public");
    return url;
  }
  if (host.includes(":")) {
    // Bare IPv6 hostname form
    if (isBlockedIPv6(host)) throw new UnsafeUpstreamError("upstream IP is not public");
    return url;
  }

  const ips = await resolveA(host).catch((e) => {
    throw new UnsafeUpstreamError(`could not resolve upstream host: ${(e as Error).message}`);
  });
  if (ips.length === 0) {
    throw new UnsafeUpstreamError("upstream host has no public A record");
  }
  for (const ip of ips) {
    const nums = parseIPv4(ip);
    if (!nums || isBlockedIPv4(nums)) {
      throw new UnsafeUpstreamError("upstream host resolves to a non-public address");
    }
  }
  return url;
}
