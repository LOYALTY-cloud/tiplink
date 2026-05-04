"use client";

import { useEffect, useState, useRef } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type TimelineEvent = {
  id: string;
  dispute_id: string;
  admin_id: string | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ProfileMap = Record<string, { handle: string | null; display_name: string | null }>;

const typeConfig: Record<string, { icon: string; color: string }> = {
  claim: { icon: "👤", color: "text-blue-400" },
  release: { icon: "🔓", color: "text-orange-400" },
  status_change: { icon: "🔄", color: "text-yellow-400" },
  note: { icon: "💬", color: "text-gray-300" },
  system: { icon: "⚙️", color: "text-purple-400" },
  proposal: { icon: "📋", color: "text-cyan-400" },
  approval: { icon: "✅", color: "text-green-400" },
  rejection: { icon: "❌", color: "text-red-400" },
};

const dotColor: Record<string, string> = {
  claim: "bg-blue-400",
  release: "bg-orange-400",
  status_change: "bg-yellow-400",
  note: "bg-gray-400",
  system: "bg-purple-400",
  proposal: "bg-cyan-400",
  approval: "bg-green-400",
  rejection: "bg-red-400",
};

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DisputeTimeline({
  disputeId,
  onClose,
  profileMap,
}: {
  disputeId: string;
  onClose: () => void;
  profileMap: ProfileMap;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [eventProfiles, setEventProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const allProfiles = { ...profileMap, ...eventProfiles };

  function adminLabel(id: string | null) {
    if (!id) return "System";
    const p = allProfiles[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  async function fetchTimeline() {
    try {
      const res = await fetch(
        `/api/admin/disputes/events?dispute_id=${encodeURIComponent(disputeId)}`,
        { headers: getAdminHeaders() },
      );
      if (!res.ok) return;
      const json = await res.json();
      setEvents(json.events ?? []);
      setEventProfiles(json.profiles ?? {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 10000);
    return () => clearInterval(interval);
  }, [disputeId]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/disputes/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ dispute_id: disputeId, message: noteText.trim() }),
      });
      if (res.ok) {
        setNoteText("");
        fetchTimeline();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-[#0B0F1A] border-l border-white/[0.12] flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.12]">
          <div>
            <h3 className="text-sm font-bold text-white">Case Timeline</h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{disputeId.slice(0, 20)}…</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No events yet</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

              <div className="space-y-4">
                {events.map((evt) => {
                  const cfg = typeConfig[evt.type] ?? { icon: "•", color: "text-gray-400" };
                  const dot = dotColor[evt.type] ?? "bg-gray-400";

                  return (
                    <div key={evt.id} className="relative pl-6">
                      {/* Dot */}
                      <div className={`absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-[#0B0F1A] ${dot}`} />

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{cfg.icon}</span>
                          <span className={`text-xs font-medium ${cfg.color}`}>
                            {evt.type === "note" || evt.type === "system"
                              ? evt.type.charAt(0).toUpperCase() + evt.type.slice(1)
                              : evt.type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          <span className="text-xs text-gray-600">·</span>
                          <span className="text-xs text-gray-500">{timeAgo(evt.created_at)}</span>
                        </div>

                        <p className="text-sm text-gray-200 leading-relaxed">{evt.message}</p>

                        {evt.admin_id && (
                          <p className="text-xs text-gray-500">
                            by <span className="text-gray-400">{adminLabel(evt.admin_id)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Add Note */}
        <div className="p-4 border-t border-white/[0.12]">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addNote();
                }
              }}
              placeholder="Write internal note…"
              className="flex-1 bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-white/20"
              rows={2}
            />
            <button
              onClick={addNote}
              disabled={submitting || !noteText.trim()}
              className="self-end px-4 py-2 rounded-lg bg-white/10 border border-white/[0.12] text-sm text-white hover:bg-white/15 transition disabled:opacity-40"
            >
              {submitting ? "…" : "Add"}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1.5">Shift+Enter for new line · Enter to send</p>
        </div>
      </div>
    </div>
  );
}
