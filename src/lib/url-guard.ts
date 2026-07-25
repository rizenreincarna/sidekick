import { isIP } from "node:net";

// Server-side fetch destination guard: blocks loopback, private, link-local,
// multicast, and reserved IP ranges so user-configured URLs (e.g. AI base
// URL) cannot be used as an SSRF primitive against internal services.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    const [a, b] = parts;
    return (
      a === 0 || // "this" network
      a === 10 || // RFC1918
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local
      (a === 172 && b >= 16 && b <= 31) || // RFC1918
      (a === 192 && b === 168) || // RFC1918
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 192 && b === 0) || // IETF protocol assignments
      (a === 198 && (b === 18 || b === 19)) || // benchmark
      (a === 192 && b === 51) || // TEST-NET-1
      (a === 203 && b === 0) || // TEST-NET-3
      a >= 224 // multicast/reserved
    );
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff")
    );
  }
  return false;
}

/**
 * Validate an outbound URL. Returns null when OK, otherwise a reason string.
 * Checks syntax, scheme, credentials, port, and literal/hostname blocklists.
 * Callers that still accept the URL MUST also pass the URL through
 * redirect validation (we fetch with redirect:"error" elsewhere).
 */
export function validateOutboundUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Invalid URL";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Only http/https URLs are allowed";
  }
  if (url.username || url.password) {
    return "URLs with embedded credentials are not allowed";
  }
  const host = url.hostname.toLowerCase();
  if (!host || host.length > 253) return "Invalid host";
  // Node's URL keeps square brackets on IPv6 literals — strip them once here.
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (BLOCKED_HOSTNAMES.has(bareHost)) return "That host is not allowed";
  if (isIP(bareHost) !== 0 && isBlockedIp(bareHost)) return "Private/reserved addresses are not allowed";
  const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
  if (port < 1 || port > 65535) return "Invalid port";
  return null;
}

/** Block well-known internal service hostnames after redirects as well. */
export function assertRedirectTargetAllowed(raw: string): void {
  const reason = validateOutboundUrl(raw);
  if (reason) {
    throw new Error(`Redirect target rejected: ${reason}`);
  }
}
