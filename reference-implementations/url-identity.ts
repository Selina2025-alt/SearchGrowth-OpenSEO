const TRACKING_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "ref",
  "source",
]);

export interface UrlIdentity {
  raw: string;
  normalized: string;
  host: string;
}

export function normalizePublicUrl(raw: string): UrlIdentity {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("unsupported URL scheme");
  }

  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  if (
    (u.protocol === "https:" && u.port === "443") ||
    (u.protocol === "http:" && u.port === "80")
  )
    u.port = "";

  // Snapshot keys before mutating: delete() during a live keys() iteration
  // would skip entries that shift into the removed slot.
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_KEYS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  u.searchParams.sort();

  // Keep meaningful path case; do not lowercase path.
  u.pathname = u.pathname.replace(/\/{2,}/g, "/");
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return { raw, normalized: u.toString(), host: u.hostname };
}

// Production:
// 1) apply SafeOutboundUrl before any network fetch;
// 2) preserve raw URL for audit;
// 3) add platform-specific canonicalization only behind versioned rules/tests.
