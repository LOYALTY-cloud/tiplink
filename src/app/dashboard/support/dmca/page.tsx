"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type FormState = "idle" | "loading" | "submitted" | "error";

export default function DMCAComplaintPage() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [reportId, setReportId]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState("loading");
    setErrorMsg(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);

    // Attach evidence files under the "evidence[]" key
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput?.files) {
      Array.from(fileInput.files).forEach((f) => formData.append("evidence[]", f));
    }

    // Include auth token if logged in (optional — anon allowed)
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
      setFormState("error");
      return;
    }

    setReportId(json.id ?? null);
    setFormState("submitted");
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (formState === "submitted") {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="text-5xl">✅</div>
          <h1 className="text-3xl font-bold">Complaint Received</h1>
          <p className="text-zinc-300 leading-7">
            Your DMCA complaint has been received. Our moderation team will
            review your submission and respond within 3–5 business days.
          </p>
          {reportId && (
            <p className="text-sm text-zinc-500">
              Reference ID:{" "}
              <span className="font-mono text-zinc-300">{reportId}</span>
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/dashboard/support"
              className="rounded-2xl bg-white text-black font-semibold px-6 py-3 hover:opacity-90 transition"
            >
              Go to Support
            </Link>
            <Link
              href="/legal/dmca"
              className="rounded-2xl border border-zinc-800 px-6 py-3 text-center hover:bg-zinc-900 transition"
            >
              View DMCA Policy
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* HERO — gradient until a real image is placed at /images/legal/dmca-hero.jpg */}
      <section className="relative h-[320px] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.12),transparent_60%)]" />

        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 flex h-full items-center justify-center px-6">
          <div className="max-w-3xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold">
              Intellectual Property Complaint Form
            </h1>

            <p className="mt-4 text-zinc-300 text-lg">
              Report copyright infringement, stolen themes,
              impersonation, or unauthorized use of intellectual property
              on 1neLink.
            </p>
          </div>
        </div>
      </section>

      {/* FORM */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <form
          onSubmit={handleSubmit}
          className="space-y-12"
        >
          {/* CONTACT INFO */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">
                Contact Information
              </h2>

              <p className="text-zinc-400 mt-2">
                Required fields are marked with *
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm">
                  First Name *
                </label>

                <input
                  required
                  type="text"
                  name="first_name"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm">
                  Last Name *
                </label>

                <input
                  required
                  type="text"
                  name="last_name"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-sm">
                Organization or Client
              </label>

              <input
                type="text"
                name="organization"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block mb-2 text-sm">
                  Email Address *
                </label>

                <input
                  required
                  type="email"
                  name="email"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm">
                  Phone Number
                </label>

                <input
                  type="tel"
                  name="phone"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                />
              </div>
            </div>
          </div>

          {/* COPYRIGHT INFO */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">
                Copyright Information
              </h2>

              <p className="text-zinc-400 mt-2">
                Describe the copyrighted work being infringed.
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm">
                Original Copyrighted Work *
              </label>

              <textarea
                required
                rows={5}
                name="copyrighted_work"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                placeholder="Describe your original content, theme, artwork, branding, or intellectual property..."
              />
            </div>

            <div>
              <label className="block mb-2 text-sm">
                URL to Original Content
              </label>

              <input
                type="url"
                name="original_content_url"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                placeholder="https://"
              />
            </div>
          </div>

          {/* INFRINGING CONTENT */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">
                Infringing Content
              </h2>

              <p className="text-zinc-400 mt-2">
                Identify the content on 1neLink that allegedly infringes
                your copyright.
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm">
                Infringing Content URL *
              </label>

              <input
                required
                type="url"
                name="infringing_content_url"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                placeholder="https://1nelink.com/..."
              />
            </div>

            <div>
              <label className="block mb-2 text-sm">
                Additional Details *
              </label>

              <textarea
                required
                rows={6}
                name="infringement_details"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-white"
                placeholder="Explain how the content infringes your intellectual property..."
              />
            </div>

            <div>
              <label className="block mb-2 text-sm">
                Upload Evidence
              </label>

              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="block w-full text-sm text-zinc-400"
              />

              <p className="mt-2 text-xs text-zinc-500">
                Screenshots, source files, ownership proof, or related evidence.
                Max 5 files · 10 MB each · JPG, PNG, WEBP, PDF.
              </p>
            </div>
          </div>

          {/* LEGAL DECLARATIONS */}
          <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-2xl font-semibold">
              Legal Declarations
            </h2>

            <label className="flex items-start gap-3">
              <input
                required
                type="checkbox"
                className="mt-1"
              />

              <span className="text-zinc-300 leading-7">
                I have a good faith belief that the disputed use is not
                authorized by the copyright owner, its agent, or the law.
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                required
                type="checkbox"
                className="mt-1"
              />

              <span className="text-zinc-300 leading-7">
                I declare under penalty of perjury that the information
                in this complaint is accurate and that I am the copyright
                owner or authorized to act on behalf of the owner.
              </span>
            </label>

            <div>
              <label className="block mb-2 text-sm">
                Electronic Signature *
              </label>

              <input
                required
                type="text"
                name="electronic_signature"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-white"
                placeholder="Type your full legal name"
              />
            </div>
          </div>

          {/* Error banner */}
          {formState === "error" && errorMsg && (
            <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          {/* ACTIONS */}
          <div className="flex flex-col md:flex-row gap-4">
            <button
              type="submit"
              disabled={formState === "loading"}
              className="rounded-2xl bg-white text-black font-semibold px-6 py-4 hover:opacity-90 transition disabled:opacity-50"
            >
              {formState === "loading"
                ? "Submitting..."
                : "Submit DMCA Complaint"}
            </button>

            <Link
              href="/legal/dmca"
              className="rounded-2xl border border-zinc-800 px-6 py-4 text-center hover:bg-zinc-900 transition"
            >
              View DMCA Policy
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
