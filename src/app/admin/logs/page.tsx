"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type ActionLog = {
  id: string;
  admin_id: string;
  action: string;
  target_user: string | null;
  metadata: Record<string, unknown> | null;
  severity: string;
  created_at: string;
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, { handle: string | null; display_name: string | null }>>({});

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel("admin-logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_actions" }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchLogs() {
    setLoading(true);
    const { data } = await supabase
      .from("admin_actions")
      .select("id, admin_id, action, target_user, metadata, severity, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = data ?? [];
    setLogs(rows);

    // Batch-fetch profiles for all admin + target user IDs
    const ids = [...new Set(rows.flatMap((r) => [r.admin_id, r.target_user].filter(Boolean) as string[]))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      const map: Record<string, { handle: string | null; display_name: string | null }> = {};
      for (const p of profiles ?? []) {
        map[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
      setProfileMap(map);
    }

    setLoading(false);
  }

  function userLabel(id: string | null) {
    if (!id) return null;
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  function actionColor(a: string) {
    switch (a) {
      case "refund": case "refund_retry": return "text-orange-400";
      case "update_status": return "text-yellow-400";
      case "bulk_restrict": return "text-red-400";
      default: return ui.muted;
    }
  }

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Action Logs</h1>

      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : logs.length === 0 ? (
        <p className={ui.muted}>No admin actions logged yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className={`${ui.card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${actionColor(log.action)}`}>
                    {log.action.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    log.severity === "critical" ? "text-red-400 bg-red-500/10 border-red-400/20" :
                    log.severity === "warning" ? "text-yellow-400 bg-yellow-500/10 border-yellow-400/20" :
                    "text-blue-300 bg-blue-500/10 border-blue-400/20"
                  }`}>
                    {(log.severity || "info").toUpperCase()}
                  </span>
                  <span className={`text-xs ${ui.muted2}`}>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                <p className={`text-xs ${ui.muted} mt-1`}>
                  Admin: {userLabel(log.admin_id) ?? "unknown"}
                  {log.target_user && (
                    <>
                      {" → "}
                      <Link href={`/admin/users/${log.target_user}`} className="text-blue-400 hover:text-blue-300 hover:underline">
                        {userLabel(log.target_user)}
                      </Link>
                    </>
                  )}
                </p>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <p className={`text-xs ${ui.muted2} mt-0.5 truncate max-w-lg`}>
                    {Object.entries(log.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
