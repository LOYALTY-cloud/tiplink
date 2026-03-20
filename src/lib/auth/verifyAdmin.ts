import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/db";
import { ADMIN_ROLES } from "./permissions";

export async function verifyAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single()
    .returns<ProfileRow>();

  if (error || !data) return false;
  return !!data.role && ADMIN_ROLES.includes(data.role);
}
