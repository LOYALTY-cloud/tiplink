/**
 * Client-side helper to retrieve the current admin session from localStorage.
 * Used by the support system to inject admin identity into live chat.
 */
export type AdminIdentity = {
  id: string;
  name: string;
  role: string;
  admin_id: string;
};

export function getAdminSession(): AdminIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("admin_session");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name && parsed?.admin_id) return parsed as AdminIdentity;
    return null;
  } catch {
    return null;
  }
}

/** Get the admin JWT token from localStorage */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

export function clearAdminSession() {
  localStorage.removeItem("admin_session");
  localStorage.removeItem("admin_token");
  // Clear the server-side HTTP-only cookie (fire-and-forget)
  fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
}

/**
 * Returns headers for admin API calls.
 * Sends the signed JWT as Authorization: Bearer <token>.
 * Also includes X-Admin-Id for backward compatibility during migration.
 */
export function getAdminHeaders(): Record<string, string> {
  const token = getAdminToken();
  const session = getAdminSession();
  const headers: Record<string, string> = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (session?.admin_id) {
    headers["X-Admin-Id"] = session.admin_id;
  }

  return headers;
}
