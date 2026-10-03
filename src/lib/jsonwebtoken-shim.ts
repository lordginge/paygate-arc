// Decode-only stand-in for the `jsonwebtoken` package.
//
// @circle-fin/w3s-pw-web-sdk imports jsonwebtoken but only ever calls
// `.decode()` on it (to read claims out of Circle's JWT in the browser).
// The real package pulls Node crypto into the browser bundle for signing
// and verification we never use. This shim implements decode() exactly:
// base64url-parse the payload segment, no signature verification (which
// matches jsonwebtoken's own decode semantics).

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

export function decode(
  token: string,
  options?: { complete?: boolean; json?: boolean },
): unknown {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    if (options?.complete) {
      const header = JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>;
      return { header, payload, signature: parts[2] ?? "" };
    }
    return payload;
  } catch {
    return null;
  }
}

export default { decode };
