"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type Appeal = {
  id: string;
  status: string;
  reason: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  theme: {
    id: string;
    name: string;
    status: string;
    preview_images: string[] | null;
    risk_score: number;
    moderation_reason: string | null;
  } | null;
  creator: {
    handle: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

type Tab = "pending" | "approved" | "rejected";

export default function AdminAppealsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appeal | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`/api/admin/marketplace/appeals?status=${status}`, { headers });
      if (!res.ok) throw new Error("Failed to load appeals");
      const json = await res.json();
      setAppeals(json.appeals ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setAppeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function handleAction(action: "approve" | "reject") {
    if (!selected) return;
    setActing(true);
    setError("");
    try {
      const headers = await getAdminHeaders();
      const res = await fetch("/api/admin/marketplace/appeals", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ appealId: selected.id, action, adminNote: adminNote.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Action failed.");
        return;
      }
      setSelected(null);
      setAdminNote("");
      load(tab);
    } catch {
      setError("Network error.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className={ui.h2}>Theme Appeals</h1>
        <p className={`${ui.muted2} text-sm mt-1`}>Review creator appeals for flagged or removed themes.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 text-sm">
        {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelected(null); }}
            className={`px-4 py-2 rounded-lg font-semibold capitalize transition border ${
              tab === t ? ui.navActive : ui.navIdle
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Appeal list */}
        <div className={`${ui.card} p-4 space-y-3`}>
          {loading ? (
            <p className={`${ui.muted2} text-sm`}>Loading…</p>
          ) : appeals.length === 0 ? (
            <p className={`${ui.muted2} text-sm`}>No {tab} appeals.</p>
          ) : (
            <>
              <p className={`${ui.muted2} text-xs`}>{total} total</p>
              {appeals.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelected(a); setAdminNote(""); setError(""); }}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selected?.id === a.id
                      ? "bg-blue-500/10 border-blue-400/30"
                      : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm truncate">
                        {a.theme?.name ?? "Unknown theme"}
                      </p>
                      <p className={`${ui.muted2} text-xs mt-0.5`}>
                        by @{a.creator?.handle ?? "unknown"} · {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${
                      a.theme?.status === "flagged"
                        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                        : "text-red-400 bg-red-500/10 border-red-500/20"
                    }`}>
                      {a.theme?.status ?? "—"}
                    </span>
                  </div>
                  {a.theme?.moderation_reason && (
                    <p className="text-xs text-red-300/70 mt-1 truncate">⚑ {a.theme.moderation_reason}</p>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className={`${ui.card} p-5 space-y-4`}>
            {/* Preview */}
            {selected.theme?.preview_images?.[0] && (
              <img
                src={selected.theme.preview_images[0]}
                alt="Theme preview"
                className="w-full max-h-48 object-cover rounded-xl border border-white/10"
              />
            )}

            <div>
              <p className={`${ui.label} mb-1`}>Theme</p>
              <p className="text-white font-semibold">{selected.theme?.name}</p>
              {selected.theme?.moderation_reason && (
                <p className="text-xs text-red-300/70 mt-1">⚑ {selected.theme.moderation_reason}</p>
              )}
              <p className={`${ui.muted2} text-xs mt-1`}>
                Risk score: {selected.theme?.risk_score ?? "—"}/100
              </p>
            </div>

            <div>
              <p className={`${ui.label} mb-1`}>Creator</p>
              <p className="text-white text-sm">{selected.creator?.display_name ?? selected.creator?.handle}</p>
              <p className={`${ui.muted2} text-xs`}>{selected.creator?.email}</p>
            </div>

            <div>
              <p className={`${ui.label} mb-1`}>Appeal reason</p>
              <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">
                {selected.reason}
              </p>
            </div>

            {tab === "pending" && (
              <>
                <div>
                  <label className={`${ui.label} block mb-2`}>Admin note (optional)</label>
                  <textarea
                    className={`${ui.input} min-h-[80px] resize-none text-sm`}
                    placeholder="Reason for decision, shown to creator…"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    maxLength={1000}
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction("approve")}
                    disabled={acting}
                    className="flex-1 rounded-xl px-4 py-3 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    {acting ? "…" : "✓ Approve"}
                  </button>
                  <button
                    onClick={() => handleAction("reject")}
                    disabled={acting}
                    className="flex-1 rounded-xl px-4 py-3 font-semibold text-white bg-red-700 hover:bg-red-600 transition disabled:opacity-50"
                  >
                    {acting ? "…" : "✕ Reject"}
                  </button>
                </div>
              </>
            )}

            {tab !== "pending" && selected.admin_note && (
              <div>
                <p className={`${ui.label} mb-1`}>Admin note</p>
                <p className="text-sm text-white/75">{selected.admin_note}</p>
              </div>
            )}
          </div>
        ) : (
          <div className={`${ui.card} p-5 flex items-center justify-center`}>
            <p className={`${ui.muted2} text-sm`}>Select an appeal to review</p>
          </div>
        )}
      </div>
    </div>
  );
}
