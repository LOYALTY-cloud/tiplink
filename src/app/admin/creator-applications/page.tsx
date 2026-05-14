"use client";

import { useEffect, useState } from "react";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type Profile = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Application = {
  id: string;
  user_id: string;
  username: string | null;
  social_links: string | null;
  description: string | null;
  audience_size: number | null;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  profile: Profile | null;
};

type Counts = { pending: number; approved: number; rejected: number };

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-400/15 text-amber-400",
  approved: "bg-green-400/15 text-green-400",
  rejected: "bg-red-400/15 text-red-400",
};

/** Split a free-text social_links field into individual URL tokens. */
function parseSocialLinks(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function SocialLinks({ raw }: { raw: string }) {
  const parts = parseSocialLinks(raw);
  return (
    <div className="space-y-0.5">
      {parts.map((part, i) => {
        const isUrl = /^https?:\/\//i.test(part);
        return isUrl ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors"
          >
            {part}
          </a>
        ) : (
          <p key={i} className="text-white/70 break-all">{part}</p>
        );
      })}
    </div>
  );
}

export default function CreatorApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  // Approve modal
  const [approveModal, setApproveModal] = useState<Application | null>(null);
  const [approveNotes, setApproveNotes] = useState("");

  // Reject modal
  const [rejectModal, setRejectModal] = useState<Application | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { window.location.href = "/admin/login"; return; }
    loadItems(filter);
  }, [filter]);

  async function loadItems(status: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/creator/applications?status=${status}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setItems(json.applications ?? []);
      setCounts(json.counts ?? { pending: 0, approved: 0, rejected: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function approve(app: Application) {
    setProcessing(app.id);
    try {
      const res = await fetch("/api/admin/creator/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          application_id: app.id,
          review_notes: approveNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error ?? "Failed to approve");
        return;
      }
      setApproveModal(null);
      setApproveNotes("");
      loadItems(filter);
    } finally {
      setProcessing(null);
    }
  }

  async function reject(app: Application) {
    setProcessing(app.id);
    try {
      const res = await fetch("/api/admin/creator/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          application_id: app.id,
          review_notes: rejectNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error ?? "Failed to reject");
        return;
      }
      setRejectModal(null);
      setRejectNotes("");
      loadItems(filter);
    } finally {
      setProcessing(null);
    }
  }

  const tabs: Array<{ key: "pending" | "approved" | "rejected"; label: string }> = [
    { key: "pending",  label: `Pending (${counts.pending})` },
    { key: "approved", label: `Approved (${counts.approved})` },
    { key: "rejected", label: `Rejected (${counts.rejected})` },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold">Creator Applications</h1>
        <p className="text-sm text-white/40 mt-1">Review and approve creator monetization requests</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              filter === t.key ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/15"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <p className="text-4xl mb-3">📋</p>
          <p>No {filter} applications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((app) => {
            const name = app.profile?.display_name ?? app.profile?.handle ?? app.username ?? "Unknown";
            const handle = app.profile?.handle ? `@${app.profile.handle}` : null;
            const email = app.profile?.email;
            return (
              <div key={app.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {app.profile?.avatar_url ? (
                      <img src={app.profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                        {name[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm">{name}</p>
                      <p className="text-xs text-white/40">{handle ?? ""}{handle && email ? " · " : ""}{email ?? ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[app.status]}`}>
                      {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </span>
                    <span className="text-xs text-white/30">
                      {new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>

                {/* Application details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {app.description && (
                    <div>
                      <p className="text-xs text-white/40 mb-1">About / Plan</p>
                      <p className="text-white/80 whitespace-pre-wrap leading-relaxed">{app.description}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {app.social_links && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Social Links</p>
                        <SocialLinks raw={app.social_links} />
                      </div>
                    )}
                    {app.audience_size != null && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Audience Size</p>
                        <p className="text-white/70">{app.audience_size.toLocaleString()}</p>
                      </div>
                    )}
                    {app.review_notes && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Review Notes</p>
                        <p className="text-white/60 italic">{app.review_notes}</p>
                      </div>
                    )}
                    {app.reviewed_at && (
                      <p className="text-xs text-white/25">
                        Reviewed {new Date(app.reviewed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {app.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setApproveModal(app); setApproveNotes(""); }}
                      disabled={processing === app.id}
                      className="px-4 py-2 bg-green-500 text-black text-sm font-semibold rounded-xl hover:bg-green-400 transition disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectModal(app); setRejectNotes(""); }}
                      disabled={processing === app.id}
                      className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-semibold rounded-xl hover:bg-red-500/30 transition disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <a
                      href={`/admin/users?q=${app.profile?.handle ?? app.user_id}`}
                      className="px-4 py-2 bg-white/5 text-white/60 text-sm rounded-xl hover:bg-white/10 transition"
                    >
                      View Profile
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Approve modal ───────────────────────────────────────────── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold">Approve Creator</h2>
            <p className="text-sm text-white/50">
              Approving <strong>{approveModal.profile?.handle ?? approveModal.username}</strong> as a creator.
            </p>

            <div>
              <label className="block text-xs text-white/40 mb-1.5">Notes (optional — visible to creator)</label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Welcome to the creator program!"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => approve(approveModal)}
                disabled={processing === approveModal.id}
                className="flex-1 py-2.5 bg-green-500 text-black font-semibold text-sm rounded-xl hover:bg-green-400 transition disabled:opacity-40"
              >
                {processing === approveModal.id ? "Approving…" : "Confirm Approve"}
              </button>
              <button
                onClick={() => setApproveModal(null)}
                className="px-4 py-2.5 bg-white/10 text-white/60 text-sm rounded-xl hover:bg-white/15 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ────────────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold">Reject Application</h2>
            <p className="text-sm text-white/50">
              Rejecting <strong>{rejectModal.profile?.handle ?? rejectModal.username}</strong>&apos;s application. They can reapply after rejection.
            </p>

            <div>
              <label className="block text-xs text-white/40 mb-1.5">Reason (optional — visible to creator)</label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="e.g. Insufficient audience or content examples"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => reject(rejectModal)}
                disabled={processing === rejectModal.id}
                className="flex-1 py-2.5 bg-red-500 text-white font-semibold text-sm rounded-xl hover:bg-red-400 transition disabled:opacity-40"
              >
                {processing === rejectModal.id ? "Rejecting…" : "Confirm Reject"}
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="px-4 py-2.5 bg-white/10 text-white/60 text-sm rounded-xl hover:bg-white/15 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
