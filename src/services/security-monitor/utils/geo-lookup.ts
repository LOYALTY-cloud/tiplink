/**
 * Geo-lookup stub.
 * Replace with ipapi.co / ip-api.com / MaxMind when needed.
 * Returns null if no key is configured — monitor still works without it.
 */
export interface GeoInfo {
  country: string;
  countryCode: string;
  city: string | null;
  isVpn: boolean;
  isTor: boolean;
}

export async function geoLookup(ip: string): Promise<GeoInfo | null> {
  if (!ip || ip === "unknown") return null;

  // Optional: use ip-api.com (free tier, no key needed, rate-limited)
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,proxy,hosting`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    if (data.status !== "success") return null;
    return {
      country:     String(data.country     ?? ""),
      countryCode: String(data.countryCode ?? ""),
      city:        data.city ? String(data.city) : null,
      isVpn:       Boolean(data.proxy),
      isTor:       Boolean(data.hosting),
    };
  } catch {
    return null;  // geo is best-effort, never block on failure
  }
}
