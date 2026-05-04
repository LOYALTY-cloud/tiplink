"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type Props = {
  selectedDate: string;
  onSelect: (date: string) => void;
};

type DayCount = {
  total: number;
  types: Record<string, number>;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const TYPE_COLOR: Record<string, string> = {
  payment: "bg-emerald-500",
  withdrawal: "bg-emerald-400",
  support: "bg-purple-400",
  disciplinary: "bg-yellow-400",
  fraud: "bg-red-500",
  system: "bg-blue-400",
};

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toMonthKey(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ActivityCalendarGrid({ selectedDate, onSelect }: Props) {
  const [month, setMonth] = useState<string>(toMonthKey(selectedDate || new Date().toISOString().slice(0, 10)));
  const [counts, setCounts] = useState<Record<string, DayCount>>({});

  useEffect(() => {
    setMonth(toMonthKey(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/activity/days?month=${encodeURIComponent(month)}`, {
          headers: getAdminHeaders(),
        });
        if (!alive) return;
        if (!res.ok) {
          setCounts({});
          return;
        }
        const json = await res.json();
        setCounts((json?.counts ?? {}) as Record<string, DayCount>);
      } catch {
        if (alive) setCounts({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [month]);

  const cells = useMemo(() => {
    const [y, m] = month.split("-").map((v) => Number(v));
    const first = new Date(Date.UTC(y, m - 1, 1));
    const firstDay = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const out: Array<string | null> = [];
    for (let i = 0; i < firstDay; i += 1) out.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [month]);

  function getIntensity(total: number): string {
    if (total > 15) return "opacity-90";
    if (total > 8) return "opacity-70";
    if (total > 3) return "opacity-50";
    return "opacity-30";
  }

  function getDominantType(types: Record<string, number>): string | null {
    const top = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return top;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
          className="h-8 w-8 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition"
          aria-label="Previous month"
        >
          ←
        </button>

        <p className="text-sm font-medium text-white/90">{monthLabel(month)}</p>

        <button
          type="button"
          onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
          className="h-8 w-8 rounded-md border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="flex gap-3 text-xs text-white/40 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" /> Finance
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-purple-400 rounded-full" /> Support
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-red-400 rounded-full" /> Fraud
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-yellow-400 rounded-full" /> Disciplinary
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-400 rounded-full" /> System
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-[11px] text-white/35">{d}</div>
        ))}

        {cells.map((day, i) => {
          if (!day) {
            return <div key={`blank-${i}`} className="h-10" />;
          }

          const dayData = counts[day];
          const total = dayData?.total ?? 0;
          const dominant = dayData ? getDominantType(dayData.types) : null;
          const color = dominant ? (TYPE_COLOR[dominant] ?? TYPE_COLOR.system) : "bg-white/10";
          const intensity = getIntensity(total);
          const selected = selectedDate === day;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              className={`relative h-10 rounded-lg border text-xs transition overflow-hidden ${
                selected
                  ? "border-blue-400/60 text-white"
                  : "border-white/10 text-white/75 hover:bg-white/5 hover:text-white"
              }`}
              title={
                total > 0
                  ? `${total} event${total === 1 ? "" : "s"}${dominant ? ` • dominant: ${dominant}` : ""}`
                  : "No activity"
              }
              aria-label={`Select ${day}${total > 0 ? `, ${total} events` : ", no activity"}`}
            >
              {total > 0 && (
                <div className={`absolute inset-0 ${color} ${intensity} transition`} />
              )}
              <span className="relative z-10 text-xs font-medium">{day.slice(8, 10)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
