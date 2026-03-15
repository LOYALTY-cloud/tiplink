import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type LockResult = { ok: true; id: string } | { ok: false; reason: string };

export async function acquireWalletLock(
  supabase: SupabaseClient,
  userId: string,
  lockType = "withdrawal",
  ttlSeconds = 300
): Promise<LockResult> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Resolve profile id: support both legacy user_id (auth.users) and new profiles.id.
  // If a profiles row doesn't exist, create a minimal one so the FK on wallet_locks succeeds.
  let resolvedUserId = userId;
  try {
    const { data: byId } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (byId && byId.id) {
      resolvedUserId = byId.id;
    } else {
      const { data: byUser } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
      if (byUser && byUser.id) {
        resolvedUserId = byUser.id;
      } else {
        const { data: ins } = await supabase.from("profiles").insert({ user_id: userId, handle: userId }).select("id").maybeSingle();
        if (ins && ins.id) resolvedUserId = ins.id;
      }
    }
  } catch (e) {
    // ignore profile resolution errors and fall back to provided userId
  }

  // Try to insert a lock row. Unique constraint on (user_id, lock_type) prevents duplicates.
    try {
      const { data, error } = await supabase
        .from("wallet_locks")
        .insert({ user_id: resolvedUserId, lock_type: lockType, expires_at: expiresAt })
        .select("id")
        .single();

    if (error) {
      // If insert failed, check if an existing lock is expired and remove it, then retry once.
      const { data: existing, error: qErr } = await supabase
      .from("wallet_locks")
      .select("id, expires_at")
      .eq("user_id", resolvedUserId)
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
          .insert({ user_id: resolvedUserId, lock_type: lockType, expires_at: expiresAt })
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
    // Resolve profile id analogous to acquireWalletLock
    let resolvedUserId = userId;
    try {
      const { data: byId } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
      if (byId && byId.id) resolvedUserId = byId.id;
      else {
        const { data: byUser } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
        if (byUser && byUser.id) resolvedUserId = byUser.id;
      }
    } catch (e) {}

    await supabase.from("wallet_locks").delete().eq("user_id", resolvedUserId).eq("lock_type", lockType);
  } catch (e) {}
}
