export type IpReputationResult = {
  provider: "none" | "ipqualityscore" | "proxycheck";
  available: boolean;
  highRisk: boolean;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  recentAbuse: boolean;
  score: number | null;
  reason: string;
};

const DEFAULT_RESULT: IpReputationResult = {
  provider: "none",
  available: false,
  highRisk: false,
  isVpn: false,
  isProxy: false,
  isTor: false,
  recentAbuse: false,
  score: null,
  reason: "not_configured",
};

function isPublicIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;

  // IPv4 private/local/link-local
  if (/^10\./.test(ip)) return false;
  if (/^127\./.test(ip)) return false;
  if (/^192\.168\./.test(ip)) return false;
  if (/^169\.254\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;

  // IPv6 local/link-local/loopback
  const lower = ip.toLowerCase();
  if (lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  if (lower.startsWith("fe80:")) return false;

  return true;
}

async function fetchWithTimeout(url: string, timeoutMs = 1800): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function queryIpQualityScore(ip: string): Promise<IpReputationResult> {
  const key = process.env.IPQUALITYSCORE_API_KEY;
  if (!key) return { ...DEFAULT_RESULT, provider: "ipqualityscore", reason: "missing_key" };

  const url = `https://www.ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true&fast=true`;

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return { ...DEFAULT_RESULT, provider: "ipqualityscore", reason: `http_${res.status}` };
    }

    const data = (await res.json()) as {
      vpn?: boolean;
      proxy?: boolean;
      tor?: boolean;
      recent_abuse?: boolean;
      fraud_score?: number;
      success?: boolean;
      message?: string;
    };

    if (data.success === false) {
      return {
        ...DEFAULT_RESULT,
        provider: "ipqualityscore",
        reason: data.message ? String(data.message) : "provider_error",
      };
    }

    const score = Number.isFinite(Number(data.fraud_score)) ? Number(data.fraud_score) : null;
    const isVpn = !!data.vpn;
    const isProxy = !!data.proxy;
    const isTor = !!data.tor;
    const recentAbuse = !!data.recent_abuse;
    const highRisk = isVpn || isProxy || isTor || recentAbuse || (score !== null && score >= 85);

    return {
      provider: "ipqualityscore",
      available: true,
      highRisk,
      isVpn,
      isProxy,
      isTor,
      recentAbuse,
      score,
      reason: "ok",
    };
  } catch {
    return { ...DEFAULT_RESULT, provider: "ipqualityscore", reason: "network_error" };
  }
}

async function queryProxyCheck(ip: string): Promise<IpReputationResult> {
  const key = process.env.PROXYCHECK_API_KEY;
  if (!key) return { ...DEFAULT_RESULT, provider: "proxycheck", reason: "missing_key" };

  const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&vpn=1&risk=1`;

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return { ...DEFAULT_RESULT, provider: "proxycheck", reason: `http_${res.status}` };
    }

    const data = (await res.json()) as Record<string, any>;
    const ipData = data[ip] as Record<string, unknown> | undefined;
    if (!ipData) {
      return { ...DEFAULT_RESULT, provider: "proxycheck", reason: "invalid_response" };
    }

    const proxy = String(ipData.proxy ?? "no").toLowerCase() === "yes";
    const type = String(ipData.type ?? "").toLowerCase();
    const risk = Number.isFinite(Number(ipData.risk)) ? Number(ipData.risk) : null;
    const isVpn = proxy && type.includes("vpn");
    const isTor = proxy && type.includes("tor");
    const isProxy = proxy && !isVpn && !isTor;
    const recentAbuse = risk !== null && risk >= 75;
    const highRisk = proxy || recentAbuse;

    return {
      provider: "proxycheck",
      available: true,
      highRisk,
      isVpn,
      isProxy,
      isTor,
      recentAbuse,
      score: risk,
      reason: "ok",
    };
  } catch {
    return { ...DEFAULT_RESULT, provider: "proxycheck", reason: "network_error" };
  }
}

export async function evaluateIpReputation(ip: string): Promise<IpReputationResult> {
  if (!isPublicIp(ip)) {
    return { ...DEFAULT_RESULT, reason: "non_public_ip" };
  }

  const provider = (process.env.IP_REPUTATION_PROVIDER || "none").toLowerCase();
  if (provider === "ipqualityscore") return queryIpQualityScore(ip);
  if (provider === "proxycheck") return queryProxyCheck(ip);

  return { ...DEFAULT_RESULT, reason: "provider_not_selected" };
}
