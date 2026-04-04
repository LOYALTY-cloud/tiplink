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

export function clearAdminSession() {
  localStorage.removeItem("admin_session");
}

/** Returns headers for admin API calls using the admin_id credential */
export function getAdminHeaders(): Record<string, string> {
  const session = getAdminSession();
  if (!session?.admin_id) return {};
  return { "X-Admin-Id": session.admin_id };
}
