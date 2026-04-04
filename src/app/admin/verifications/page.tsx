"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type OcrData = {
  full_name?: string;
  date_of_birth?: string;
  id_number?: string;
  error?: string;
};

type UserInfo = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_status: string | null;
};

type Verification = {
  id: string;
  user_id: string;
  status: string;
  document_url: string;
  document_back_url: string | null;
  signed_document_url: string | null;
  signed_document_back_url: string | null;
  document_type: string;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  ocr_data: OcrData | null;
  match_score: number | null;
  user: UserInfo | null;
};

const DOC_LABELS: Record<string, string> = {
  id_card: "ID Card",
  passport: "Passport",
  driver_license: "Driver's License",
};

export default function AdminVerificationsPage() {
  const [items, setItems] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<Verification | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function loadItems(status: string) {
    setLoading(true);
    const headers = getAdminHeaders();
    const res = await fetch(`/api/admin/verifications?status=${status}`, {
      headers: { "Content-Type": "application/json", ...headers },
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    const s = getAdminSession();
    if (!s) return;
    loadItems(filter);
  }, [filter]);

  async function handleApprove(v: Verification) {
    if (!confirm(`Approve verification for ${v.user?.display_name || v.user?.handle || v.user_id}? This will set their account to active.`)) return;
    setProcessing(v.id);
    const headers = getAdminHeaders();
    await fetch("/api/admin/verifications/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: v.id, action: "approve" }),
    });
    setProcessing(null);
    loadItems(filter);
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) return;
    setProcessing(rejectModal.id);
    const headers = getAdminHeaders();
    await fetch("/api/admin/verifications/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: rejectModal.id, action: "reject", reason: rejectReason.trim() }),
    });
    setProcessing(null);
    setRejectModal(null);
    setRejectReason("");
    loadItems(filter);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={ui.h2}>Identity Verifications</h1>
        <div className="flex gap-1">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                filter === s
                  ? "bg-white/10 text-white"
                  : `${ui.muted} hover:text-white hover:bg-white/5`
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className={`${ui.card} p-8 text-center`}>
          <p className={ui.muted}>No {filter} verifications</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((v) => {
            const userName = v.user?.display_name || v.user?.handle || "Unknown";
            const isProcessing = processing === v.id;

            return (
              <div key={v.id} className={`${ui.card} p-4`}>
                <div className="flex items-start justify-between gap-4">
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {v.user?.avatar_url ? (
                      <img
                        src={v.user.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-white/10 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${v.user_id}`}
                        className="text-sm font-semibold hover:underline truncate block"
                      >
                        {userName}
                      </Link>
                      <p className={`text-xs ${ui.muted} truncate`}>
                        {v.user?.email ?? v.user_id}
                      </p>
                      <p className={`text-xs ${ui.muted2}`}>
                        {DOC_LABELS[v.document_type] || v.document_type} • Submitted {new Date(v.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                    v.status === "pending" ? "bg-yellow-500/10 text-yellow-400" :
                    v.status === "approved" ? "bg-emerald-500/10 text-emerald-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {v.status}
                  </span>
                </div>

                {/* Document previews — use signed URLs */}
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => setPreviewUrl(v.signed_document_url || v.document_url)}
                    className="border border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition w-32 h-20 flex items-center justify-center bg-white/5"
                  >
                    {v.document_url.endsWith(".pdf") ? (
                      <span className={`text-xs ${ui.muted}`}>📄 PDF</span>
                    ) : (
                      <img src={v.signed_document_url || v.document_url} alt="Front" className="w-full h-full object-cover" />
                    )}
                  </button>
                  {(v.signed_document_back_url || v.document_back_url) && (
                    <button
                      onClick={() => setPreviewUrl(v.signed_document_back_url || v.document_back_url!)}
                      className="border border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition w-32 h-20 flex items-center justify-center bg-white/5"
                    >
                      {(v.document_back_url || "").endsWith(".pdf") ? (
                        <span className={`text-xs ${ui.muted}`}>📄 PDF</span>
                      ) : (
                        <img src={v.signed_document_back_url || v.document_back_url!} alt="Back" className="w-full h-full object-cover" />
                      )}
                    </button>
                  )}
                </div>

                {/* OCR Data + Match Score */}
                {v.ocr_data && !v.ocr_data.error && (
                  <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 space-y-1">
                    <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">AI-Extracted Data</p>
                    {v.ocr_data.full_name && (
                      <p className="text-sm">
                        <span className={`${ui.muted} text-xs`}>Name (OCR):</span>{" "}
                        <span className="text-white font-medium">{v.ocr_data.full_name}</span>
                      </p>
                    )}
                    {v.ocr_data.date_of_birth && (
                      <p className="text-sm">
                        <span className={`${ui.muted} text-xs`}>DOB (OCR):</span>{" "}
                        <span className="text-white font-medium">{v.ocr_data.date_of_birth}</span>
                      </p>
                    )}
                    {v.ocr_data.id_number && (
                      <p className="text-sm">
                        <span className={`${ui.muted} text-xs`}>ID # (OCR):</span>{" "}
                        <span className="text-white font-medium">{v.ocr_data.id_number}</span>
                      </p>
                    )}
                    {v.match_score !== null && v.match_score !== undefined && (
                      <p className="text-sm pt-1">
                        <span className={`${ui.muted} text-xs`}>Match Score:</span>{" "}
                        <span className={`font-bold ${
                          v.match_score > 80 ? "text-emerald-400" :
                          v.match_score > 50 ? "text-amber-400" :
                          "text-red-400"
                        }`}>
                          {v.match_score}%
                        </span>
                        <span className={`ml-2 text-xs ${
                          v.match_score > 80 ? "text-emerald-400/60" :
                          v.match_score > 50 ? "text-amber-400/60" :
                          "text-red-400/60"
                        }`}>
                          {v.match_score > 80 ? "High confidence" :
                           v.match_score > 50 ? "Partial match" :
                           "Low match — review carefully"}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {v.ocr_data?.error && (
                  <p className="text-xs text-amber-400/70 mt-2">⚠ OCR could not extract data: {v.ocr_data.error}</p>
                )}

                {/* Rejection reason (for history) */}
                {v.rejection_reason && (
                  <p className="text-xs text-red-400/70 mt-2">Reason: {v.rejection_reason}</p>
                )}

                {/* Actions (only for pending) */}
                {v.status === "pending" && (
                  <div className="flex items-center gap-2 mt-3">
                    {/* Smart suggestion based on match score */}
                    {v.match_score !== null && v.match_score !== undefined && (
                      <span className={`text-xs px-2 py-1 rounded-full mr-1 ${
                        v.match_score > 80 ? "bg-emerald-500/10 text-emerald-400" :
                        v.match_score > 50 ? "bg-amber-500/10 text-amber-400" :
                        "bg-red-500/10 text-red-400"
                      }`}>
                        {v.match_score > 80 ? "✓ Recommended" :
                         v.match_score > 50 ? "⚠ Needs Review" :
                         "✕ Low Match"}
                      </span>
                    )}
                    <button
                      onClick={() => handleApprove(v)}
                      disabled={isProcessing}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                    >
                      {isProcessing ? "..." : "✓ Approve"}
                    </button>
                    <button
                      onClick={() => { setRejectModal(v); setRejectReason(""); }}
                      disabled={isProcessing}
                      className="bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${ui.card} p-6 w-full max-w-[420px] space-y-4`}>
            <h2 className="text-lg font-semibold text-red-400">Reject Verification</h2>
            <p className={`text-sm ${ui.muted}`}>
              Rejecting for <span className="text-white font-semibold">{rejectModal.user?.display_name || rejectModal.user?.handle || "user"}</span>.
              The user will be notified and can re-submit.
            </p>
            <div>
              <p className="text-xs text-gray-400 mb-2">Reason (required):</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Document blurry, expired, or name doesn't match"
                rows={3}
                className={`${ui.input} !py-2 !text-sm resize-none`}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className={`${ui.btnGhost} ${ui.btnSmall}`}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || processing === rejectModal.id}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white text-lg"
            >
              ✕ Close
            </button>
            {previewUrl.endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[80vh] rounded-xl" />
            ) : (
              <img src={previewUrl} alt="Document" className="w-full rounded-xl" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
