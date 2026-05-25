"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type FormState = "idle" | "loading" | "submitted" | "error";

const FIELD_LABEL = "block mb-1.5 text-xs font-medium text-white/60 uppercase tracking-wider";

export default function DMCAComplaintPage() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [reportId, setReportId]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState("loading");
    setErrorMsg(null);
    setIsConflict(false);

    const form     = e.currentTarget;
    const formData = new FormData(form);

    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput?.files) {
      Array.from(fileInput.files).forEach((f) => formData.append("evidence[]", f));
    }

    const headers: HeadersInit = {};
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // anon submission
    }

    const res  = await fetch("/api/dmca/submit", { method: "POST", headers, body: formData });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrorMsg(json.error ?? "Failed to submit. Please try again.");
      setIsConflict(res.status === 409);
      setFormState("error");
      return;
    }

    setReportId(json.id ?? null);
    setFormState("submitted");
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (formState === "submitted") {
    return (
      <div className={`${ui.page} flex items-center justify-center px-4`}>
        <div className={ui.glowWrap}>
          <div className={ui.glow1} />
          <div className={ui.glow2} />
          <div className={ui.glow3} />
        </div>
        <div className="relative z-10 max-w-md w-full text-center space-y-5 py-16">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/25 flex items-center justify-center text-3xl">
            ✅
          </div>
          <h1 className={ui.h1}>Complaint Received</h1>
          <p className={`${ui.muted} leading-7`}>
            Your DMCA complaint has been received. Our moderation team will
            review your submission and respond within 3–5 business days.
          </p>
          {reportId && (
            <p className={`text-sm ${ui.muted2}`}>
              Reference ID:{" "}
              <span className="font-mono text-white/80">{reportId}</span>
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/dashboard/support" className={ui.btnPrimary}>
              Back to Support
            </Link>
            <Link href="/legal/dmca" className={ui.btnGhost}>
              View DMCA Policy
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      {/* Glow blobs */}
      <div className={ui.glowWrap}>
        <div className={ui.glow1} />
        <div className={ui.glow2} />
        <div className={ui.glow3} />
        <div className={ui.topLine} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Page header */}
        <div className="space-y-1">
          <Link href="/dashboard/support" className={`${ui.btnLink} text-sm flex items-center gap-1 mb-4`}>
            ← Support
          </Link>
          <h1 className={ui.h1}>⚖️ DMCA / IP Complaint</h1>
          <p className={`${ui.muted} text-sm leading-6`}>
            Report copyright infringement, stolen themes, impersonation, or
            unauthorized use of your intellectual property on 1neLink.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Contact Information ─────────────────────────────────────── */}
          <div className={`${ui.card} p-5 space-y-5`}>
            <h2 className={ui.h2}>Contact Information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>First Name *</label>
                <input required type="text" name="first_name" className={ui.input} placeholder="Jane" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Last Name *</label>
                <input required type="text" name="last_name" className={ui.input} placeholder="Doe" />
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Organization or Client</label>
              <input type="text" name="organization" className={ui.input} placeholder="Optional" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Email Address *</label>
                <input required type="email" name="email" className={ui.input} placeholder="jane@example.com" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Phone Number</label>
                <input type="tel" name="phone" className={ui.input} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* ── Copyright Information ───────────────────────────────────── */}
          <div className={`${ui.card} p-5 space-y-5`}>
            <div>
              <h2 className={ui.h2}>Copyright Information</h2>
              <p className={`text-sm ${ui.muted2} mt-1`}>Describe the original work that was infringed.</p>
            </div>

            <div>
              <label className={FIELD_LABEL}>Original Copyrighted Work *</label>
              <textarea
                required
                rows={4}
                name="copyrighted_work"
                className={`${ui.input} resize-none`}
                placeholder="Describe your original content, theme, artwork, branding, or intellectual property…"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>URL to Original Content</label>
              <input
                type="url"
                name="original_content_url"
                className={ui.input}
                placeholder="https://"
              />
            </div>
          </div>

          {/* ── Infringing Content ──────────────────────────────────────── */}
          <div className={`${ui.card} p-5 space-y-5`}>
            <div>
              <h2 className={ui.h2}>Infringing Content</h2>
              <p className={`text-sm ${ui.muted2} mt-1`}>Identify the content on 1neLink that infringes your copyright.</p>
            </div>

            <div>
              <label className={FIELD_LABEL}>Infringing Content URL *</label>
              <input
                required
                type="url"
                name="infringing_content_url"
                className={ui.input}
                placeholder="https://1nelink.com/..."
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Additional Details *</label>
              <textarea
                required
                rows={5}
                name="infringement_details"
                className={`${ui.input} resize-none`}
                placeholder="Explain how the content infringes your intellectual property…"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Upload Evidence</label>
              <div className={`${ui.cardInner} px-4 py-3`}>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="block w-full text-sm text-white/60 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white/80 hover:file:bg-white/15 file:cursor-pointer"
                />
              </div>
              <p className={`mt-2 text-xs ${ui.muted2}`}>
                Screenshots, source files, or ownership proof · Max 5 files · 10 MB each · JPG, PNG, WEBP, PDF
              </p>
            </div>
          </div>

          {/* ── Legal Declarations ──────────────────────────────────────── */}
          <div className={`${ui.card} p-5 space-y-5`}>
            <h2 className={ui.h2}>Legal Declarations</h2>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                required
                type="checkbox"
                className="mt-1 accent-blue-500 w-4 h-4 shrink-0"
              />
              <span className={`text-sm ${ui.muted} leading-6 group-hover:text-white transition`}>
                I have a good faith belief that the disputed use is not authorized
                by the copyright owner, its agent, or the law.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                required
                type="checkbox"
                className="mt-1 accent-blue-500 w-4 h-4 shrink-0"
              />
              <span className={`text-sm ${ui.muted} leading-6 group-hover:text-white transition`}>
                I declare under penalty of perjury that the information in this
                complaint is accurate and that I am the copyright owner or
                authorized to act on behalf of the owner.
              </span>
            </label>

            <div>
              <label className={FIELD_LABEL}>Electronic Signature *</label>
              <input
                required
                type="text"
                name="electronic_signature"
                className={ui.input}
                placeholder="Type your full legal name"
              />
              <p className={`mt-1.5 text-xs ${ui.muted2}`}>
                By signing you acknowledge this is a legally binding declaration.
              </p>
            </div>
          </div>

          {/* Error banner */}
          {formState === "error" && errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <p>{errorMsg}</p>
              {isConflict && (
                <Link
                  href="/dashboard/support/my-reports"
                  className="mt-2 inline-block text-blue-400 hover:text-blue-300 underline underline-offset-2 text-xs"
                >
                  View your active reports →
                </Link>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={formState === "loading"}
              className={`${ui.btnPrimary} flex-1 text-center`}
            >
              {formState === "loading" ? "Submitting…" : "Submit DMCA Complaint"}
            </button>
            <Link href="/legal/dmca" className={`${ui.btnGhost} text-center`}>
              View DMCA Policy
            </Link>
          </div>

        </form>
      </div>
    </div>
  );
}
