import { getAdminSession, type AdminIdentity } from "@/lib/auth/adminSession"

export type Identity =
  | { type: "admin"; name: string; admin_id: string; role: string }
  | { type: "user"; name: string; user_id: string }

/**
 * Returns the current identity based on context.
 * Admin identity takes priority (checked via localStorage).
 * Falls back to user profile identity.
 */
export function getIdentity(profile?: { id?: string; display_name?: string } | null): Identity {
  const admin = getAdminSession()

  if (admin?.admin_id) {
    return {
      type: "admin",
      name: admin.name,
      admin_id: admin.admin_id,
      role: admin.role,
    }
  }

  return {
    type: "user",
    name: profile?.display_name ?? "User",
    user_id: profile?.id ?? "",
  }
}

/** Format identity name for display */
export function formatIdentityName(identity: Identity): string {
  if (identity.type === "admin") return identity.name
  return `@${identity.name}`
}
