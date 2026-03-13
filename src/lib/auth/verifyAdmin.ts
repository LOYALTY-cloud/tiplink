import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/db";

export async function verifyAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()
    .returns<ProfileRow>();

  if (error || !data) return false;
  return data.role === "admin";
}
