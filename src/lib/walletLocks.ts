import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type LockResult = { ok: true; id: string } | { ok: false; reason: string };

export async function acquireWalletLock(
  supabase: SupabaseClient,
  userId: string,
  lockType = "withdrawal",
  ttlSeconds = 300
): Promise<LockResult> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Map auth.user id -> profiles.id when profiles table uses separate PK.
  try {
    const { data: profile } = await supabase.from('profiles').select('id,user_id').eq('user_id', userId).maybeSingle();
    if (profile && (profile as any).id) {
      userId = (profile as any).id;
    }
  } catch (e) {}

  // Try to insert a lock row. Unique constraint on (user_id, lock_type) prevents duplicates.
  try {
    const { data, error } = await supabase
      .from("wallet_locks")
      .insert({ user_id: userId, lock_type: lockType, expires_at: expiresAt })
      .select("id")
      .single();

    if (error) {
      // If insert failed, check if an existing lock is expired and remove it, then retry once.
      const { data: existing, error: qErr } = await supabase
        .from("wallet_locks")
        .select("id, expires_at")
        .eq("user_id", userId)
        .eq("lock_type", lockType)
        .maybeSingle();

      if (qErr) return { ok: false, reason: qErr.message };

      if (existing && existing.expires_at && new Date(existing.expires_at) < new Date()) {
        // expired — remove and retry
        try {
          await supabase.from("wallet_locks").delete().eq("id", existing.id);
        } catch (e) {}

        const { data: d2, error: e2 } = await supabase
          .from("wallet_locks")
          .insert({ user_id: userId, lock_type: lockType, expires_at: expiresAt })
          .select("id")
          .single();

        if (e2) return { ok: false, reason: e2.message };
        return { ok: true, id: d2.id };
      }

      return { ok: false, reason: error.message || "lock_exists" };
    }

    return { ok: true, id: data.id };
  } catch (e: unknown) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function releaseWalletLock(
  supabase: SupabaseClient,
  userId: string,
  lockType = "withdrawal"
): Promise<void> {
  try {
    // Map auth.user id -> profiles.id when profiles table uses separate PK.
    try {
      const { data: profile } = await supabase.from('profiles').select('id,user_id').eq('user_id', userId).maybeSingle();
      if (profile && (profile as any).id) {
        userId = (profile as any).id;
      }
    } catch (e) {}

    await supabase.from("wallet_locks").delete().eq("user_id", userId).eq("lock_type", lockType);
  } catch (e) {}
}
