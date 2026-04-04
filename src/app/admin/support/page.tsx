"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type SupportSession = {
  id: string;
  user_id: string | null;
  user_handle: string | null;
  status: string;
  last_message: string | null;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  created_at: string;
  updated_at: string;
  priority: number;
  mode: string;
  escalation: boolean;
  escalation_reason: string | null;
};

type AdminPresence = {
  user_id: string;
  display_name: string | null;
  availability: string;
  role: string;
};

export default function AdminSupportPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [admins, setAdmins] = useState<AdminPresence[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial sessions via API (service-role bypasses RLS)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/support/sessions", {
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          setAdmins(data.admins || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabaseAdmin
      .channel("support-queue")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_sessions",
        },
        (payload) => {
          setSessions((prev) => [payload.new as SupportSession, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_sessions",
        },
        (payload) => {
          const updated = payload.new as SupportSession;
          setSessions((prev) => {
            // Remove closed sessions from the queue
            if (updated.status === "closed") {
              return prev.filter((s) => s.id !== updated.id);
            }
            return prev.map((s) => (s.id === updated.id ? updated : s));
          });
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, []);

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  function adminStatus(session: SupportSession) {
    if (!session.assigned_admin_id) return null;
    // Use real availability from profiles
    const admin = admins.find((a) => a.user_id === session.assigned_admin_id);
    if (!admin) return null;
    if (admin.availability === "online") return { label: "Online", color: "text-emerald-400", dot: "🟢" };
    if (admin.availability === "busy") return { label: "Busy", color: "text-yellow-400", dot: "🟡" };
    return { label: "Offline", color: "text-white/40", dot: "⚪" };
  }

  const onlineAdmins = admins.filter((a) => a.availability === "online");
  const busyAdmins = admins.filter((a) => a.availability === "busy");

  return (
    <div className="p-4 text-white">
      {/* Admin Presence Panel */}
      <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
        <h2 className="text-sm font-semibold mb-2">Team Status</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {admins.map((a) => (
            <span key={a.user_id} className="flex items-center gap-1.5">
              <span>
                {a.availability === "online" ? "🟢" : a.availability === "busy" ? "🟡" : "⚪"}
              </span>
              <span className={a.availability === "offline" ? "text-white/40" : "text-white/80"}>
                {a.display_name || "Admin"}
              </span>
            </span>
          ))}
          {admins.length === 0 && <span className="text-white/40">No admins found</span>}
        </div>
        <div className="mt-2 text-[10px] text-white/30">
          {onlineAdmins.length} online · {busyAdmins.length} busy · {admins.length - onlineAdmins.length - busyAdmins.length} offline
        </div>
      </div>

      <div id="support-queue" className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Support Queue</h1>
        <button
          onClick={() => router.push("/admin/support/analytics")}
          className="text-xs text-white/40 hover:text-white/60 transition"
        >
          📊 Analytics →
        </button>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-white/40 text-sm">No active support sessions</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {s.user_handle ? `@${s.user_handle}` : s.user_id ? `User ${s.user_id.slice(0, 8)}…` : "Anonymous"}
                    </p>
                    {s.priority >= 3 && (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">CRITICAL</span>
                    )}
                    {s.priority === 2 && (
                      <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded">HIGH</span>
                    )}
                    {s.priority === 1 && (
                      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/15 px-1.5 py-0.5 rounded">MED</span>
                    )}
                    {s.mode === "ai" && (
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">🤖 AI</span>
                    )}
                    {s.escalation && (
                      <span className="text-[10px] font-bold text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded" title={s.escalation_reason || undefined}>🔥 ESCALATED</span>
                    )}
                  </div>
                  <p className="text-xs text-white/60">
                    {s.last_message || "No messages yet"}
                  </p>
                  <p className="text-xs text-white/30 mt-1">
                    {timeAgo(s.created_at)}
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className={`text-xs font-medium ${
                      s.status === "waiting"
                        ? "text-yellow-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {s.status}
                  </span>
                  {s.assigned_admin_name && (
                    <p className="text-xs text-white/40 mt-1">
                      → {s.assigned_admin_name}
                      {(() => {
                        const status = adminStatus(s);
                        return status ? (
                          <span className={`ml-2 ${status.color}`}>
                            {status.dot} {status.label}
                          </span>
                        ) : null;
                      })()}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => router.push(`/admin/support/${s.id}`)}
                className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                Open Chat →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
