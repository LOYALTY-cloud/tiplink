/**
 * Mask an IP address for safe display.
 * IPv4: 185.220.101.42  →  185.220.101.*
 * IPv6: 2a02:1234:5678:90ab::1  →  2a02:1234:5678:90ab:***
 */
export function maskIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + ":***";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return ip;
}

/**
 * Extract the IP segment from a rate-limit key.
 * Keys look like "signup:1.2.3.4" or "pay:user-uuid".
 * Returns null if the suffix doesn't look like an IP.
 */
export function extractIpFromRateLimitKey(key: string): string | null {
  const lastColon = key.lastIndexOf(":");
  if (lastColon < 0) return null;
  const candidate = key.slice(lastColon + 1);
  return /^[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}$/.test(candidate) ||
         /^[0-9a-f:]{4,}$/i.test(candidate)
    ? candidate
    : null;
}
