"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { showGlobalToast } from "@/components/GlobalToast";
import { ui } from "@/lib/ui";
import { encodeSupportFileRef } from "@/lib/supportFiles";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "text-blue-400" },
  in_progress: { label: "In Progress", color: "text-yellow-400" },
  resolved: { label: "Resolved", color: "text-green-400" },
  closed: { label: "Closed", color: "text-white/55" },
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch("/api/support/tickets", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
      } else {
        showGlobalToast("Failed to load tickets");
      }
    } catch {
      showGlobalToast("Failed to load tickets");
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);

    let fileUrl: string | undefined;
    let fileType: string | undefined;

    // Upload file if attached
    if (file) {
      const ts = Date.now();
      const path = `tickets/${ts}-${file.name}`;
      const { error } = await supabase.storage
        .from("support-files")
        .upload(path, file);
      if (!error) {
        fileUrl = encodeSupportFileRef(path);
        fileType = file.type;
      }
    }

    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        subject: subject.trim(),
        category,
        message: message.trim(),
        file_url: fileUrl,
        file_type: fileType,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setSubmitted(data.ticket?.id ?? "submitted");
      setSubject("");
      setCategory("other");
      setMessage("");
      setFile(null);
      loadTickets();
    } else {
      showGlobalToast("Failed to submit ticket. Please try again.");
    }

    setSubmitting(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/support"
            className={`${ui.btnGhost} px-3 py-2 ${ui.btnSmall}`}
          >
            ←
          </Link>
          <div>
            <h1 className={ui.h2}>Support Tickets</h1>
            <p className={`text-sm ${ui.muted}`}>Track and submit issues</p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setSubmitted(null);
          }}
          className={`${ui.btnPrimary} ${ui.btnSmall} text-sm`}
        >
          {showForm ? "Cancel" : "+ New Ticket"}
        </button>
      </div>

      {/* New Ticket Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className={`${ui.card} p-5 space-y-4`}>
          {submitted ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-green-400 font-semibold">
                Your ticket has been created!
              </p>
              <p className={`text-xs ${ui.muted} font-mono`}>
                Ticket ID: #{submitted.slice(0, 8)}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(null);
                  setShowForm(false);
                }}
                className={`${ui.btnGhost} ${ui.btnSmall} text-sm mt-2`}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm text-white/70 block mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className={ui.input}
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <label className="text-sm text-white/70 block mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={ui.select}
                >
                  <option value="payment_issue">Payment Issue</option>
                  <option value="account_issue">Account Issue</option>
                  <option value="bug_report">Bug Report</option>
                  <option value="payout_issue">Payout / Withdrawal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-white/70 block mb-1">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  className={`${ui.input} min-h-[120px] resize-y`}
                  maxLength={2000}
                  required
                />
              </div>

              <div>
                <label className="text-sm text-white/70 block mb-1">
                  Attachment (optional)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className={`${ui.input} text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white/70 file:text-sm`}
                />
                {file && (
                  <p className={`text-xs ${ui.muted2} mt-1`}>
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !subject.trim() || !message.trim()}
                className={`${ui.btnPrimary} w-full`}
              >
                {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            </>
          )}
        </form>
      )}

      {/* Ticket List */}
      {loading ? (
        <div className="space-y-2 py-4 animate-[fadeIn_0.3s_ease]">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/[0.12] px-4 py-3 flex items-center gap-3">
              <div className="h-5 w-5 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 bg-white/[0.06] rounded-xl animate-pulse" />
                <div className="h-3 w-24 bg-white/[0.06] rounded-xl animate-pulse" />
              </div>
              <div className="h-4 w-14 bg-white/[0.06] rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      ) : tickets.length === 0 && !showForm ? (
        <div className={`${ui.card} px-5 py-8 text-center space-y-3`}>
          <p className="text-3xl">🎫</p>
          <p className={`text-sm ${ui.muted}`}>
            No tickets yet. Create one if you need help with a complex issue.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className={`${ui.btnPrimary} ${ui.btnSmall} text-sm`}
          >
            + New Ticket
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const st = STATUS_LABELS[t.status] ?? STATUS_LABELS.open;
            return (
              <Link
                key={t.id}
                href={`/dashboard/support/tickets/${t.id}`}
                className={`${ui.card} block px-4 py-3 hover:bg-white/[0.08] transition`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.subject}</p>
                    <p className={`text-xs ${ui.muted2} mt-0.5`}>
                      {t.category.replace("_", " ")} ·{" "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${st.color} shrink-0`}>
                    {st.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
