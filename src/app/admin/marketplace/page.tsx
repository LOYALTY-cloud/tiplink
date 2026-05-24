"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type QueueTheme = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  status: string;
  risk_score: number;
  moderation_reason: string | null;
  duplicate_warning: boolean;
  preview_images: string[] | null;
  created_at: string;
  user_id: string;
  report_count: number;
  dmca_count: number;
  creator: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

type QueueTab = "pending" | "flagged" | "removed" | "all";
type ActionState = "idle" | "loading";

function riskColor(score: number) {
  if (score >= 70) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (score >= 40) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

function statusPill(status: string) {
  switch (status) {
    case "pending_review": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "flagged": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "removed": return "text-red-400 bg-red-500/10 border-red-500/20";
    case "banned_creator": return "text-red-500 bg-red-500/15 border-red-500/30";
    case "approved": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    default: return "text-white/50 bg-white/5 border-white/10";
  }
}

export default function MarketplaceModerationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedThemeId = searchParams.get("q") ?? null;
  const [themes, setThemes] = useState<QueueTheme[]>([]);
  const [counts, setCounts] = useState({ pending: 0, flagged: 0 });
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueTab>("pending");
  const [selected, setSelected] = useState<QueueTheme | null>(null);
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [flagReason, setFlagReason] = useState("");
  const [strikeReason, setStrikeReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actionPanel, setActionPanel] = useState<"flag" | "strike" | "reject" | null>(null);
  const [toast, setToast] = useState("");
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 3000);
  }, []);

  useEffect(() => {
    const s = getAdminSession();
    if (!s) { router.replace("/admin/login"); return; }
    const allowed = ["owner", "super_admin", "admin", "moderator"];
    if (!allowed.includes(s.role)) { router.replace("/admin"); return; }

    if (linkedThemeId) {
      // Came from reports page — look up this specific theme and auto-select it
      void fetchLinkedTheme(linkedThemeId);
    } else {
      fetchQueue(queue);
    }
  }, [router]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLinkedTheme(id: string) {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/admin/marketplace/queue?q=${encodeURIComponent(id)}`, {
        headers: getAdminHeaders(),
      });
      const json = await res.json();
      const theme: QueueTheme | undefined = json.themes?.[0];
      if (theme) {
        setThemes([theme]);
        setSelected(theme);
        // Switch to the "all" tab so the list shows the theme
        setQueue("all");
      } else {
        // Theme not found — fall back to normal queue
        fetchQueue(queue);
      }
    } catch {
      fetchQueue(queue);
    } finally {
      setLoading(false);
    }
  }

  async function fetchQueue(q: QueueTab) {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/admin/marketplace/queue?queue=${q}&limit=50`, {
        headers: getAdminHeaders(),
      });
      const json = await res.json();
      setThemes(json.themes ?? []);
      setCounts(json.counts ?? { pending: 0, flagged: 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function changeQueue(q: QueueTab) {
    setQueue(q);
    fetchQueue(q);
  }

  async function doApprove(themeId: string) {
    setActionState("loading");
    try {
      const res = await fetch("/api/admin/marketplace/approve", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ themeId }),
      });
      if (res.ok) {
        showToast("Theme approved ✅");
        setThemes((prev) => prev.filter((t) => t.id !== themeId));
        setSelected(null);
      } else {
        showToast("Failed to approve theme.");
      }
    } finally {
      setActionState("idle");
    }
  }

  async function doFlag(themeId: string) {
    if (!flagReason.trim()) return;
    setActionState("loading");
    try {
      const res = await fetch("/api/admin/marketplace/flag", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, reason: flagReason.trim() }),
      });
      if (res.ok) {
        showToast("Theme flagged");
        setThemes((prev) => prev.filter((t) => t.id !== themeId));
        setSelected(null);
        setActionPanel(null);
        setFlagReason("");
      } else {
        showToast("Failed to flag theme.");
      }
    } finally {
      setActionState("idle");
    }
  }

  async function doStrike(themeId: string) {
    if (!strikeReason.trim()) return;
    setActionState("loading");
    try {
      const res = await fetch("/api/admin/marketplace/strike", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, reason: strikeReason.trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`Strike issued (${json.strikes} total) 🚨`);
        setThemes((prev) => prev.filter((t) => t.id !== themeId));
        setSelected(null);
        setActionPanel(null);
        setStrikeReason("");
      } else {
        showToast("Failed to issue strike.");
      }
    } finally {
      setActionState("idle");
    }
  }

  async function doReject(themeId: string) {
    if (!rejectReason.trim()) return;
    setActionState("loading");
    try {
      const res = await fetch("/api/admin/marketplace/reject", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, reason: rejectReason.trim() }),
      });
      if (res.ok) {
        showToast("Theme rejected — creator notified 📧");
        setThemes((prev) => prev.filter((t) => t.id !== themeId));
        setSelected(null);
        setActionPanel(null);
        setRejectReason("");
      } else {
        const json = await res.json();
        showToast(json.error ?? "Failed to reject theme.");
      }
    } finally {
      setActionState("idle");
    }
  }

  const tabs: { key: QueueTab; label: string; badge?: number }[] = [
    { key: "pending", label: "Pending Review", badge: counts.pending },
    { key: "flagged", label: "AI Flagged", badge: counts.flagged },
    { key: "removed", label: "Removed" },
    { key: "all", label: "All" },
  ];

  return (
    <div className={`${ui.page} p-4 sm:p-6`}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className={ui.h1}>Theme Store Moderation</h1>
          <p className={`${ui.muted2} text-sm mt-1`}>Review, approve, flag, and action creator themes.</p>
        </div>

        {/* Queue tabs — horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => changeQueue(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition flex items-center gap-2
                ${queue === t.key
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-transparent border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
                }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="bg-blue-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Theme list */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`${ui.card} h-24 animate-pulse`} />
              ))
            ) : themes.length === 0 ? (
              <div className={`${ui.card} p-8 text-center ${ui.muted2}`}>
                No themes in this queue.
              </div>
            ) : (
              themes.map((t) => (
                <div
                  key={t.id}
                  onClick={() => { setSelected(t); setActionPanel(null); }}
                  className={`${ui.card} p-4 cursor-pointer transition hover:border-white/20 active:scale-[0.99]
                    ${selected?.id === t.id ? "border-blue-500/40 bg-blue-500/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {t.preview_images?.[0] && (
                      <img
                        src={t.preview_images[0]}
                        alt={t.name}
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-white/5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm truncate">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusPill(t.status)}`}>
                          {t.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className={`${ui.muted2} text-xs mt-0.5 truncate`}>
                        {t.creator?.handle ?? t.user_id} · {t.category}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${riskColor(t.risk_score)}`}>
                          Risk {t.risk_score}
                        </span>
                        {t.report_count > 0 && (
                          <span className="text-xs text-red-400">⚠ {t.report_count} report{t.report_count !== 1 ? "s" : ""}</span>
                        )}
                        {t.dmca_count > 0 && (
                          <span className="text-xs text-red-500">⚖ {t.dmca_count} DMCA</span>
                        )}
                        {t.duplicate_warning && (
                          <span className="text-xs text-amber-400">⛔ Duplicate</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail panel — fixed full-screen overlay on mobile, sticky side panel on desktop */}
          {selected && (
            <div className="fixed inset-0 z-40 overflow-y-auto bg-[#030810] lg:static lg:z-auto lg:overflow-visible lg:bg-transparent">
              <div className={`${ui.card} p-4 sm:p-5 min-h-full lg:min-h-0 lg:h-fit lg:sticky lg:top-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:pb-5`}>
                <div className="flex items-center justify-between mb-4">
                  {/* Back button — mobile only */}
                  <button
                    onClick={() => setSelected(null)}
                    className="lg:hidden flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition"
                  >
                    ← Back
                  </button>
                  <h2 className={`${ui.h2} truncate hidden lg:block`}>{selected.name}</h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="hidden lg:block text-white/40 hover:text-white text-xl leading-none"
                  >
                    ✕
                  </button>
                </div>
                {/* Name shown below back button on mobile */}
                <h2 className={`${ui.h2} truncate mb-4 lg:hidden`}>{selected.name}</h2>

              {/* Preview images */}
              {selected.preview_images && selected.preview_images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {selected.preview_images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Preview ${i + 1}`}
                      className="h-28 w-auto rounded-lg object-cover flex-shrink-0 bg-white/5"
                    />
                  ))}
                </div>
              )}

              <div className="space-y-2 text-sm mb-4">
                <div className="flex gap-2">
                  <span className={ui.muted2}>Creator:</span>
                  <span className="text-white">{selected.creator?.display_name ?? selected.creator?.handle ?? selected.user_id}</span>
                </div>
                <div className="flex gap-2">
                  <span className={ui.muted2}>Category:</span>
                  <span className="text-white">{selected.category}</span>
                </div>
                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {selected.tags.map((tg) => (
                      <span key={tg} className={ui.chip}>{tg}</span>
                    ))}
                  </div>
                )}
                {selected.moderation_reason && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-amber-400 text-xs">
                    {selected.moderation_reason}
                  </div>
                )}
                {selected.description && (
                  <p className={`${ui.muted2} text-xs mt-2`}>{selected.description}</p>
                )}
              </div>

              {/* Action sub-panels */}
              {actionPanel === "flag" && (
                <div className="mb-4 space-y-2">
                  <label className={`${ui.label} block`}>Flag Reason</label>
                  <textarea
                    className={`${ui.input} min-h-[70px] resize-none text-sm`}
                    placeholder="Reason for flagging…"
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className={`${ui.btnGhost} text-sm flex-1`}
                      onClick={() => setActionPanel(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl px-4 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition disabled:opacity-50"
                      disabled={!flagReason.trim() || actionState === "loading"}
                      onClick={() => doFlag(selected.id)}
                    >
                      {actionState === "loading" ? "Flagging…" : "Flag Theme"}
                    </button>
                  </div>
                </div>
              )}

              {actionPanel === "reject" && (
                <div className="mb-4 space-y-2">
                  <label className={`${ui.label} block`}>Rejection Reason <span className="text-red-400">*</span></label>
                  <p className="text-xs text-white/40">This will be sent to the creator via email.</p>
                  <textarea
                    className={`${ui.input} min-h-[80px] resize-none text-sm`}
                    placeholder="Explain why this theme is being rejected (e.g. explicit content, copyright violation, misleading preview)…"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className={`${ui.btnGhost} text-sm flex-1`}
                      onClick={() => setActionPanel(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl px-4 py-2 bg-red-600/20 border border-red-600/30 text-red-400 text-sm font-semibold hover:bg-red-600/30 transition disabled:opacity-50"
                      disabled={!rejectReason.trim() || actionState === "loading"}
                      onClick={() => doReject(selected.id)}
                    >
                      {actionState === "loading" ? "Rejecting…" : "🚫 Reject & Notify"}
                    </button>
                  </div>
                </div>
              )}

              {actionPanel === "strike" && (
                <div className="mb-4 space-y-2">
                  <label className={`${ui.label} block`}>Strike Reason</label>
                  <textarea
                    className={`${ui.input} min-h-[70px] resize-none text-sm`}
                    placeholder="Reason for issuing strike to creator…"
                    value={strikeReason}
                    onChange={(e) => setStrikeReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className={`${ui.btnGhost} text-sm flex-1`}
                      onClick={() => setActionPanel(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition disabled:opacity-50"
                      disabled={!strikeReason.trim() || actionState === "loading"}
                      onClick={() => doStrike(selected.id)}
                    >
                      {actionState === "loading" ? "Issuing…" : "Issue Strike"}
                    </button>
                  </div>
                </div>
              )}

              {/* Main action buttons */}
              {!actionPanel && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="rounded-xl px-3 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 transition disabled:opacity-50 col-span-2"
                    disabled={actionState === "loading"}
                    onClick={() => doApprove(selected.id)}
                  >
                    {actionState === "loading" ? "…" : "✅ Approve"}
                  </button>
                  <button
                    className="rounded-xl px-3 py-3 bg-red-600/20 border border-red-600/30 text-red-400 text-sm font-semibold hover:bg-red-600/30 transition col-span-2"
                    onClick={() => setActionPanel("reject")}
                  >
                    🚫 Reject
                  </button>
                  <button
                    className="rounded-xl px-3 py-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition"
                    onClick={() => setActionPanel("flag")}
                  >
                    🚩 Flag
                  </button>
                  <button
                    className="rounded-xl px-3 py-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition"
                    onClick={() => setActionPanel("strike")}
                  >
                    ⚡ Strike Creator
                  </button>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
