"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";

export default function DMCAPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    claimantName: "",
    company: "",
    email: "",
    themeUrl: "",
    copyrightProof: "",
    description: "",
    signature: "",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isValid =
    form.claimantName.trim() &&
    form.email.trim() &&
    form.description.trim() &&
    form.signature.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/marketplace/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantName: form.claimantName.trim(),
          company: form.company.trim() || null,
          email: form.email.trim(),
          themeUrl: form.themeUrl.trim() || null,
          copyrightProof: form.copyrightProof.trim() || null,
          description: form.description.trim(),
          signature: form.signature.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Submission failed.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className={`${ui.page} flex items-center justify-center p-6`}>
        <div className={`${ui.card} max-w-md w-full p-8 text-center`}>
          <div className="text-4xl mb-4">📋</div>
          <h1 className={ui.h1}>Claim received</h1>
          <p className={`${ui.muted2} mt-3 text-sm`}>
            We&apos;ll review your DMCA claim and respond within 5–10 business days.
          </p>
          <button className={`${ui.btnPrimary} mt-6 w-full`} onClick={() => router.push("/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.page} p-4 sm:p-6`}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className={ui.h1}>DMCA Takedown Request</h1>
          <p className={`${ui.muted2} mt-1 text-sm`}>
            If you believe a theme infringes your copyright, submit this form.
            False claims may result in legal liability.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={`${ui.card} p-6 space-y-5`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`${ui.label} block mb-2`}>Full Name *</label>
              <input
                className={ui.input}
                placeholder="Jane Smith"
                value={form.claimantName}
                onChange={(e) => set("claimantName", e.target.value)}
                maxLength={120}
              />
            </div>
            <div>
              <label className={`${ui.label} block mb-2`}>Company (optional)</label>
              <input
                className={ui.input}
                placeholder="Acme Corp"
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                maxLength={120}
              />
            </div>
          </div>

          <div>
            <label className={`${ui.label} block mb-2`}>Email Address *</label>
            <input
              className={ui.input}
              type="email"
              placeholder="legal@example.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <label className={`${ui.label} block mb-2`}>Link to infringing theme (optional)</label>
            <input
              className={ui.input}
              placeholder="https://1nelink.com/store/..."
              value={form.themeUrl}
              onChange={(e) => set("themeUrl", e.target.value)}
              maxLength={500}
            />
          </div>

          <div>
            <label className={`${ui.label} block mb-2`}>Copyright Proof (optional)</label>
            <textarea
              className={`${ui.input} min-h-[80px] resize-none`}
              placeholder="Registration number, original work URL, or description of ownership…"
              value={form.copyrightProof}
              onChange={(e) => set("copyrightProof", e.target.value)}
              maxLength={1000}
            />
          </div>

          <div>
            <label className={`${ui.label} block mb-2`}>Description of Infringement *</label>
            <textarea
              className={`${ui.input} min-h-[120px] resize-none`}
              placeholder="Describe specifically how the theme infringes your copyright…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <label className={`${ui.label} block mb-2`}>Electronic Signature *</label>
            <input
              className={ui.input}
              placeholder="Type your full legal name as your signature"
              value={form.signature}
              onChange={(e) => set("signature", e.target.value)}
              maxLength={120}
            />
            <p className={`${ui.muted2} text-xs mt-1`}>
              By typing your name, you affirm this claim is accurate under penalty of perjury.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className={`${ui.btnPrimary} w-full`}
            disabled={!isValid || loading}
          >
            {loading ? "Submitting…" : "Submit DMCA Claim"}
          </button>
        </form>
      </div>
    </div>
  );
}
