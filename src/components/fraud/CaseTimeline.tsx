"use client";

import { useEffect, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

export type TimelineEvent = {
  type: "note" | "admin" | "transaction" | "anomaly" | "withdrawal" | "tip";
  label: string;
  created_at: string;
  role: string;
  actor: string;
  score?: number;
  decision?: string;
  flags?: string[];
  amount?: number;
  severity?: string;
};

const typeConfig: Record<string, { icon: string; color: string; dot: string }> = {
  anomaly:     { icon: "🔴", color: "text-red-400",    dot: "bg-red-400" },
  admin:       { icon: "🛡️", color: "text-purple-400", dot: "bg-purple-400" },
  withdrawal:  { icon: "💸", color: "text-yellow-400", dot: "bg-yellow-400" },
  tip:         { icon: "💚", color: "text-green-400",  dot: "bg-green-400" },
  transaction: { icon: "📒", color: "text-blue-400",   dot: "bg-blue-400" },
  note:        { icon: "📝", color: "text-white/60",   dot: "bg-white/40" },
};

type Props = {
  userId?: string;
  events?: TimelineEvent[];
  onEventsLoaded?: (events: TimelineEvent[]) => void;
};

export default function CaseTimeline({ userId, events: externalEvents, onEventsLoaded }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(externalEvents ?? []);
  const [loading, setLoading] = useState(!externalEvents);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalEvents) {
      setEvents(externalEvents);
      setLoading(false);
      return;
    }
    if (!userId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = getAdminHeaders();
        const res = await fetch(`/api/admin/user-timeline?user_id=${encodeURIComponent(userId!)}`, {
          headers,
        });
        if (!res.ok) {
          setError("Failed to load timeline");
          setLoading(false);
          return;
        }
        const body = await res.json();
        const loaded = body.data ?? [];
        setEvents(loaded);
        onEventsLoaded?.(loaded);
      } catch {
        setError("Network error");
      }
      setLoading(false);
    }
    load();
  }, [userId, externalEvents, onEventsLoaded]);

  if (loading) return <p className={ui.muted}>Loading timeline…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (events.length === 0) return <p className={ui.muted}>No activity found.</p>;

  return (
    <div className={`${ui.card} ${ui.cardInner} p-4 space-y-1`}>
      <h3 className="text-white font-semibold text-sm mb-3">Timeline</h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

        <div className="space-y-3">
          {events.map((e, i) => {
            const cfg = typeConfig[e.type] ?? typeConfig.note;
            return (
              <div key={i} className="flex items-start gap-3 relative">
                {/* Dot */}
                <div className={`w-[15px] h-[15px] rounded-full ${cfg.dot} flex-shrink-0 mt-0.5 ring-2 ring-zinc-900 z-10`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{cfg.icon}</span>
                    <span className={`text-xs font-medium uppercase tracking-wide ${cfg.color}`}>
                      {e.type}
                    </span>
                    <span className="text-white/25 text-xs ml-auto whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-white/70 text-sm mt-0.5 break-words">{e.label}</p>
                  {e.actor && e.actor !== "System" && (
                    <p className="text-white/30 text-xs mt-0.5">by {e.actor}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
