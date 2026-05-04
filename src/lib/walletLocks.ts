import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type LockResult = { ok: true; id: string } | { ok: false; reason: string };

export async function acquireWalletLock(
  supabase: SupabaseClient,
  userId: string,
  lockType = "withdrawal",
  ttlSeconds = 300
): Promise<LockResult> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  try {
    // First attempt: straight insert (fastest path when no lock exists)
    const { data, error } = await supabase
      .from("wallet_locks")
      .insert({ user_id: userId, lock_type: lockType, expires_at: expiresAt })
      .select("id")
      .single();

    if (!error && data) {
      return { ok: true, id: data.id };
    }

    // Insert failed (likely unique constraint violation — lock already exists).
    // Atomically delete expired lock and retry in one step via RPC,
    // or fall back to a single conditional delete + re-insert.

    // Atomic: delete ONLY if expired, then re-insert
    const { data: deleted } = await supabase
      .from("wallet_locks")
      .delete()
      .eq("user_id", userId)
      .eq("lock_type", lockType)
      .lt("expires_at", new Date().toISOString())
      .select("id");

    // If we deleted an expired lock, try inserting again
    if (deleted && deleted.length > 0) {
      const { data: d2, error: e2 } = await supabase
        .from("wallet_locks")
        .insert({ user_id: userId, lock_type: lockType, expires_at: expiresAt })
        .select("id")
        .single();

      if (e2) return { ok: false, reason: e2.message };
      return { ok: true, id: d2.id };
    }

    // Lock exists and is not expired — genuinely held by another request
    return { ok: false, reason: error?.message || "lock_exists" };
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
    await supabase.from("wallet_locks").delete().eq("user_id", userId).eq("lock_type", lockType);
  } catch (e) {}
}
