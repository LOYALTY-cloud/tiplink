"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";

type FreezeLog = {
  id: string;
  user_id: string;
  action: string;
  freeze_level: string | null;
  reason: string | null;
  triggered_by: string;
  admin_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  handle?: string | null;
  email?: string | null;
};

export default function FreezeAuditLog() {
  const [logs, setLogs] = useState<FreezeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "freeze" | "unfreeze">("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("account_freeze_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("action", filter);
    }

    const { data, error: dbErr } = await query;

    if (dbErr) {
      setError(dbErr.message);
      setLogs([]);
    } else {
      // Enrich with profile info
      const userIds = [...new Set((data ?? []).map((l) => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p])
      );

      setLogs(
        (data ?? []).map((l) => ({
          ...l,
          handle: profileMap.get(l.user_id)?.handle,
          email: profileMap.get(l.user_id)?.email,
        }))
      );
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={`${ui.h2} text-lg`}>
          Freeze Audit Log{" "}
          <span className="text-white/55 text-sm font-normal">({logs.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {(["all", "freeze", "unfreeze"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filter === f ? ui.navActive : ui.navIdle
              }`}
            >
              {f === "all" ? "All" : f === "freeze" ? "🔒 Freezes" : "🔓 Unfreezes"}
            </button>
          ))}
          <button onClick={fetchLogs} className={`${ui.btnGhost} ${ui.btnSmall}`}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className={ui.muted}>Loading audit log…</p>
      ) : logs.length === 0 ? (
        <div className={`${ui.card} ${ui.cardInner} p-8 text-center`}>
          <p className={ui.muted}>No freeze events recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`rounded-xl p-4 border transition ${
                log.action === "freeze"
                  ? "bg-red-500/5 border-red-500/15"
                  : "bg-green-500/5 border-green-500/15"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">
                      {log.action === "freeze" ? "🔒" : "🔓"}
                    </span>
                    <span className="text-white font-medium text-sm">
                      {log.handle ? `@${log.handle}` : log.email ?? log.user_id.slice(0, 12) + "…"}
                    </span>
                    {log.freeze_level && (
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          log.freeze_level === "hard"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {log.freeze_level}
                      </span>
                    )}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        log.triggered_by === "system"
                          ? "bg-blue-500/10 text-blue-400"
                          : log.triggered_by === "admin"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-green-500/10 text-green-400"
                      }`}
                    >
                      {log.triggered_by}
                    </span>
                  </div>
                  <p className="text-white/60 text-xs truncate">
                    {log.reason ?? "No reason"}
                  </p>
                </div>
                <p className="text-white/45 text-xs shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
