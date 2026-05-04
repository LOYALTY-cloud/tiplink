"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import ActivityCalendarGrid from "@/components/admin/ActivityCalendarGrid";

type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  related_id: string | null;
  metadata: Record<string, unknown>;
  severity: string;
  created_at: string;
};

const TYPE_STYLE: Record<string, string> = {
  payment: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  withdrawal: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  disciplinary: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  support: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  fraud: "text-red-300 border-red-500/30 bg-red-500/10",
  admin_action: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  system: "text-white/75 border-white/15 bg-white/5",
};

function formatDateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminActivityCalendarPage() {
  const router = useRouter();
  const sessionRef = useRef(getAdminSession());
  const session = sessionRef.current;
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const role = session?.role;
    if (!session || (role !== "owner" && role !== "super_admin")) {
      router.replace("/admin");
      return;
    }
    void fetchEvents(date);
  }, [date, router, session]);

  async function fetchEvents(targetDate: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/activity?date=${encodeURIComponent(targetDate)}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(typeof json?.error === "string" ? json.error : "Failed to load activity.");
        setEvents([]);
        return;
      }

      const json = await res.json();
      setEvents((json.events ?? []) as ActivityEvent[]);
    } catch {
      setError("Failed to load activity.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const heading = useMemo(() => formatDateHeading(date), [date]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className={ui.h1}>Activity Calendar</h1>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Calendar selects the day. Timeline is the source-of-truth audit record.
          </p>
        </div>
      </div>

      <div className={`${ui.card} p-4`}>
        <p className="text-xs uppercase tracking-wider text-white/45 mb-2">Select Date</p>
        <ActivityCalendarGrid selectedDate={date} onSelect={setDate} />
      </div>

      <div className={`${ui.card} p-5`}>
        <p className="text-xs uppercase tracking-wider text-white/40 mb-3">{heading}</p>

        {loading ? (
          <div className="py-10 text-center">
            <p className={ui.muted}>Loading activity timeline...</p>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center">
            <p className={ui.muted}>No activity for this day.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      TYPE_STYLE[event.type] ?? TYPE_STYLE.system
                    }`}
                  >
                    {event.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-white/35 ml-auto">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="text-sm text-white font-medium mt-2">{event.title}</p>
                {event.description ? (
                  <p className="text-xs text-white/45 mt-1 leading-5">{event.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
