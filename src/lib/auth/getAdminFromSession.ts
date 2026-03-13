import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getAdminFromSession(accessToken: string | null) {
  if (!accessToken) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const user = data.user;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
    .returns<import("@/types/db").ProfileRow>();

  if (profileErr || !profile) return null;
  if (profile.role !== "admin") return null;

  return user.id;
}
