import { validateOutboundUrl } from "./url-guard";

/**
 * Guarded fetch for AI provider endpoints. Validates the destination against
 * SSRF blocklists, forbids redirects (so a provider can't bounce the
 * Authorization header to another host), and caps the request time.
 */
export async function guardedProviderFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const reason = validateOutboundUrl(url);
  if (reason) {
    throw new Error(`Blocked outbound request: ${reason}`);
  }
  const { timeoutMs = 30000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
