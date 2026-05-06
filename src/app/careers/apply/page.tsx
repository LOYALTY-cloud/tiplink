"use client";

import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";

const ROLES = [
  "Backend Engineer",
  "Fintech Engineer",
  "Security Engineer",
  "Customer Support",
  "Trust & Safety",
  "Payments Operations",
] as const;

type ApplicationForm = {
  name: string;
  email: string;
  phone: string;
  authorized: string;
  sponsorship: string;
  role: string;
  salary: string;
  start_date: string;
  years: string;
  experience: string;
  system: string;
  why: string;
  felony: string;
  felony_explain: string;
  portfolio: string;
  linkedin: string;
  school: string;
  degree: string;
  discipline: string;
  additional_profiles: string;
  why_role: string;
  company_mission: string;
  previously_employed: string;
  employment_dates: string;
  contract_work: string;
  contract_details: string;
  references: string;
  resumePath: string;
  coverPath: string;
  agree: boolean;
};

const INITIAL: ApplicationForm = {
  name: "", email: "", phone: "",
  authorized: "", sponsorship: "",
  role: "", salary: "", start_date: "",
  years: "", experience: "", system: "", why: "",
  felony: "", felony_explain: "",
  portfolio: "", linkedin: "",
  school: "", degree: "", discipline: "",
  additional_profiles: "", why_role: "", company_mission: "",
  previously_employed: "", employment_dates: "",
  contract_work: "", contract_details: "",
  references: "",
  resumePath: "", coverPath: "",
  agree: false,
};

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition text-sm";
const selectCls =
  "w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition text-sm";
const labelCls = "text-xs text-white/50 font-medium uppercase tracking-wide";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelCls}>{label}{required && " *"}</label>
      {children}
    </div>
  );
}

function SectionHead({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-4 pb-4 border-b border-white/8">
      <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">
        {n}
      </div>
      <div>
        <h2 className="font-semibold text-white text-base">{title}</h2>
        {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ApplyPageContent() {
  // State must start identical on server and client to avoid hydration mismatch.
  // The role is read from the URL in a useEffect (client-only, post-hydration).
  const [form, setForm] = useState<ApplicationForm>({ ...INITIAL });
  const [uploadStatus, setUploadStatus] = useState<{ resume: string; cover: string }>({ resume: "", cover: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("role") ?? "";
    const role = (ROLES as readonly string[]).includes(param as typeof ROLES[number]) ? param : "";
    if (role) setForm((prev) => ({ ...prev, role }));
  }, []);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = e.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setForm((prev) => ({ ...prev, [target.name]: value }));
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>, fileType: "resume" | "cover_letter") {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = fileType === "resume" ? "resume" : "cover";
    setUploadStatus((prev) => ({ ...prev, [key]: "uploading" }));
    setError(null);
    const fd = new window.FormData();
    fd.append("file", file);
    fd.append("fileType", fileType);
    try {
      const res = await fetch("/api/careers/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Upload failed. Please try again.");
        setUploadStatus((prev) => ({ ...prev, [key]: "error" }));
        return;
      }
      const pathKey = fileType === "resume" ? "resumePath" : "coverPath";
      setForm((prev) => ({ ...prev, [pathKey]: data.path as string }));
      setUploadStatus((prev) => ({ ...prev, [key]: "done" }));
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setUploadStatus((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.agree) {
      setError("You must certify that the information provided is accurate.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          resume_url: form.resumePath || null,
          cover_letter_url: form.coverPath || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050A1A] text-white px-4 py-16">
      {/* Ambient glow — transform-gpu forces GPU compositing so these never
          trigger main-thread repaints when the user scrolls or types. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-600/10 rounded-full blur-[80px] transform-gpu" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-700/8 rounded-full blur-[80px] transform-gpu" />
      </div>

      <div className="relative max-w-2xl mx-auto">
        {/* Page header */}
        <div className="mb-10">
          <Link href="/careers" className="text-white/40 text-sm hover:text-white/70 transition mb-6 inline-block">
            ← Back to open positions
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-xs text-white/30 uppercase tracking-widest">Employment Application</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {form.role ? `Apply — ${form.role}` : "Apply at 1neLink"}
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            This is a formal employment application. Complete all required sections accurately.
            Information provided is subject to verification.
          </p>
        </div>

        {success ? (
          <div className="rounded-2xl bg-green-500/10 border border-green-500/20 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center text-2xl mx-auto mb-4">✓</div>
            <h2 className="text-lg font-semibold mb-2">Application Received</h2>
            <p className="text-white/50 text-sm max-w-sm mx-auto mb-6">
              We review every application manually and respond within 5–7 business days.
              Check your inbox for a confirmation email.
            </p>
            <Link
              href="/careers"
              className="inline-block text-sm text-blue-400 hover:text-blue-300 transition border border-blue-500/30 rounded-xl px-5 py-2.5"
            >
              ← Back to open positions
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">

            {/* ── 1. Personal Information ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={1} title="Personal Information" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full Legal Name" required>
                  <input name="name" value={form.name} onChange={handleChange}
                    placeholder="Jane Smith" required maxLength={100} className={inputCls} />
                </Field>
                <Field label="Email Address" required>
                  <input name="email" type="email" value={form.email} onChange={handleChange}
                    placeholder="jane@example.com" required maxLength={200} className={inputCls} />
                </Field>
              </div>
              <Field label="Phone Number" required>
                <input name="phone" type="tel" value={form.phone} onChange={handleChange}
                  placeholder="+1 (555) 000-0000" required maxLength={30} className={inputCls} />
              </Field>
            </section>

            {/* ── 2. Work Eligibility ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={2} title="Work Eligibility" subtitle="Required for all applicants. Answers do not automatically disqualify you." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Authorized to work in the U.S.?" required>
                  <select name="authorized" value={form.authorized} onChange={handleChange} required className={selectCls}>
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Will you require visa sponsorship?" required>
                  <select name="sponsorship" value={form.sponsorship} onChange={handleChange} required className={selectCls}>
                    <option value="">Select…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes — I will require sponsorship</option>
                  </select>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Previously employed at 1neLink?">
                  <select name="previously_employed" value={form.previously_employed} onChange={handleChange} className={selectCls}>
                    <option value="">Select…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Contract work with 1neLink or affiliates?">
                  <select name="contract_work" value={form.contract_work} onChange={handleChange} className={selectCls}>
                    <option value="">Select…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
              </div>
              {form.previously_employed === "yes" && (
                <Field label="Employment dates">
                  <input name="employment_dates" value={form.employment_dates} onChange={handleChange}
                    placeholder="e.g. Jan 2024 – Mar 2025" maxLength={100} className={inputCls} />
                </Field>
              )}
              {form.contract_work === "yes" && (
                <Field label="Contract work details">
                  <textarea name="contract_details" value={form.contract_details} onChange={handleChange}
                    placeholder="Describe the nature and dates of the contract work"
                    rows={2} maxLength={500} className={inputCls + " resize-none"} />
                </Field>
              )}
            </section>

            {/* ── 3. Position ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={3} title="Position Applied For" />
              <Field label="Role" required>
                <select name="role" value={form.role} onChange={handleChange} required className={selectCls}>
                  <option value="">Select a position…</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Desired Salary">
                  <input name="salary" value={form.salary} onChange={handleChange}
                    placeholder="e.g. $110,000 / year" maxLength={80} className={inputCls} />
                </Field>
                <Field label="Earliest Start Date">
                  <input name="start_date" type="date" value={form.start_date} onChange={handleChange}
                    className={inputCls + " [color-scheme:dark]"} />
                </Field>
              </div>
            </section>

            {/* ── 4. Education ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={4} title="Education" subtitle="Most recent or highest level. Leave blank if not applicable." />
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="School / University">
                  <input name="school" value={form.school} onChange={handleChange}
                    placeholder="e.g. MIT" maxLength={150} className={inputCls} />
                </Field>
                <Field label="Degree">
                  <input name="degree" value={form.degree} onChange={handleChange}
                    placeholder="e.g. B.S." maxLength={100} className={inputCls} />
                </Field>
                <Field label="Field of Study">
                  <input name="discipline" value={form.discipline} onChange={handleChange}
                    placeholder="e.g. Computer Science" maxLength={100} className={inputCls} />
                </Field>
              </div>
            </section>

            {/* ── 5. Experience ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={5} title="Experience & Skills" />
              <Field label="Years of Relevant Experience">
                <select name="years" value={form.years} onChange={handleChange} className={selectCls}>
                  <option value="">Select…</option>
                  <option value="<1">Less than 1 year</option>
                  <option value="1-2">1–2 years</option>
                  <option value="3-5">3–5 years</option>
                  <option value="6-9">6–9 years</option>
                  <option value="10+">10+ years</option>
                </select>
              </Field>
              <Field label="Work History & Relevant Experience" required>
                <textarea name="experience" value={form.experience} onChange={handleChange}
                  placeholder="Describe your background, past roles, and relevant accomplishments. Include company names, titles, and dates where possible."
                  required rows={5} maxLength={3000} className={inputCls + " resize-none"} />
                <span className="text-xs text-white/25 self-end">{form.experience.length} / 3000</span>
              </Field>
              <Field label="Describe a System You've Built" required>
                <textarea name="system" value={form.system} onChange={handleChange}
                  placeholder="Walk us through a meaningful technical or operational system you designed or shipped — architecture, scale, tradeoffs, what you'd do differently."
                  required rows={5} maxLength={3000} className={inputCls + " resize-none"} />
                <span className="text-xs text-white/25 self-end">{form.system.length} / 3000</span>
              </Field>
              <Field label="Why 1neLink?" required>
                <textarea name="why" value={form.why} onChange={handleChange}
                  placeholder="Why do you want to work here specifically? What about fintech, creator payments, or our product interests you?"
                  required rows={4} maxLength={2000} className={inputCls + " resize-none"} />
                <span className="text-xs text-white/25 self-end">{form.why.length} / 2000</span>
              </Field>
            </section>

            {/* ── 6. Additional Questions ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={6} title="Additional Questions" subtitle="Help us understand your motivations and professional presence." />
              <Field label="Additional Profiles (GitHub, portfolio, other links)">
                <input name="additional_profiles" value={form.additional_profiles} onChange={handleChange}
                  placeholder="https://github.com/you, https://yoursite.com" maxLength={500} className={inputCls} />
              </Field>
              <Field label="Why are you applying for this specific role?" required>
                <textarea name="why_role" value={form.why_role} onChange={handleChange}
                  placeholder="What draws you to this role? What skills and experiences make you a strong fit?"
                  required rows={4} maxLength={2000} className={inputCls + " resize-none"} />
                <span className="text-xs text-white/25 self-end">{form.why_role.length} / 2000</span>
              </Field>
              <Field label="What does our mission mean to you?" required>
                <textarea name="company_mission" value={form.company_mission} onChange={handleChange}
                  placeholder="How does helping creators and sellers get paid connect to your own values or goals?"
                  required rows={3} maxLength={1500} className={inputCls + " resize-none"} />
                <span className="text-xs text-white/25 self-end">{form.company_mission.length} / 1500</span>
              </Field>
            </section>

            {/* ── 7. Background Disclosure ── */}
            <section className="rounded-2xl bg-amber-500/[0.06] border border-amber-500/15 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={7} title="Background Disclosure"
                subtitle="A conviction does not automatically disqualify you. We evaluate nature, recency, and relevance to the role." />
              <Field label="Have you ever been convicted of a felony?" required>
                <select name="felony" value={form.felony} onChange={handleChange} required
                  className={selectCls + " border-amber-500/20"}>
                  <option value="">Select…</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
              {form.felony === "yes" && (
                <Field label="Please explain — nature, date, and outcome">
                  <textarea name="felony_explain" value={form.felony_explain} onChange={handleChange}
                    placeholder="Provide context. We review all disclosures individually."
                    rows={3} maxLength={1000} className={inputCls + " resize-none"} />
                </Field>
              )}
            </section>

            {/* ── 8. Links & Portfolio ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={8} title="Links & Portfolio" subtitle="Optional but strongly recommended for technical roles." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="GitHub / Portfolio">
                  <input name="portfolio" value={form.portfolio} onChange={handleChange}
                    placeholder="https://github.com/you" maxLength={300} className={inputCls} />
                </Field>
                <Field label="LinkedIn">
                  <input name="linkedin" value={form.linkedin} onChange={handleChange}
                    placeholder="https://linkedin.com/in/you" maxLength={300} className={inputCls} />
                </Field>
              </div>
            </section>

            {/* ── 9. Documents ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={9} title="Documents" subtitle="Resume required. PDF, DOC, or DOCX only." />

              <Field label="Resume" required>
                <div className="flex flex-col gap-2">
                  <label className={`flex items-center gap-3 w-full bg-white/5 border ${
                    uploadStatus.resume === "error" ? "border-red-500/40" :
                    uploadStatus.resume === "done"  ? "border-green-500/40" : "border-white/10"
                  } rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.07] transition`}>
                    <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className={`text-sm shrink-0 ${
                      uploadStatus.resume === "done"  ? "text-green-400" :
                      uploadStatus.resume === "error" ? "text-red-400" : "text-white/40"
                    }`}>
                      {uploadStatus.resume === "uploading" ? "Uploading…" :
                       uploadStatus.resume === "done"     ? "✓ Resume uploaded" :
                       uploadStatus.resume === "error"    ? "✗ Upload failed" : "Choose file…"}
                    </span>
                    <input type="file" accept=".pdf,.doc,.docx" required={!form.resumePath}
                      disabled={uploadStatus.resume === "uploading"}
                      onChange={(e) => handleFileChange(e, "resume")} className="sr-only" />
                  </label>
                  <p className="text-xs text-white/25">PDF, DOC, or DOCX — max 2 MB</p>
                </div>
              </Field>

              <Field label="Cover Letter">
                <div className="flex flex-col gap-2">
                  <label className={`flex items-center gap-3 w-full bg-white/5 border ${
                    uploadStatus.cover === "error" ? "border-red-500/40" :
                    uploadStatus.cover === "done"  ? "border-green-500/40" : "border-white/10"
                  } rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.07] transition`}>
                    <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className={`text-sm shrink-0 ${
                      uploadStatus.cover === "done"  ? "text-green-400" :
                      uploadStatus.cover === "error" ? "text-red-400" : "text-white/40"
                    }`}>
                      {uploadStatus.cover === "uploading" ? "Uploading…" :
                       uploadStatus.cover === "done"     ? "✓ Cover letter uploaded" :
                       uploadStatus.cover === "error"    ? "✗ Upload failed" : "Choose file…"}
                    </span>
                    <input type="file" accept=".pdf,.doc,.docx"
                      disabled={uploadStatus.cover === "uploading"}
                      onChange={(e) => handleFileChange(e, "cover_letter")} className="sr-only" />
                  </label>
                  <p className="text-xs text-white/25">PDF, DOC, or DOCX — max 512 KB — optional</p>
                </div>
              </Field>
            </section>

            {/* ── 10. References ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={10} title="Professional References"
                subtitle="List 2–3 people who can speak to your work. Include name, title, company, and contact." />
              <Field label="References">
                <textarea name="references" value={form.references} onChange={handleChange}
                  placeholder={"1. Jane Doe — CTO at Acme Corp — jane@acme.com\n2. John Smith — Engineering Manager at Stripe — john@stripe.com"}
                  rows={5} maxLength={2000} className={inputCls + " resize-none"} />
              </Field>
            </section>

            {/* ── 11. Certification ── */}
            <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-5">
              <SectionHead n={11} title="Certification & Agreement" />
              <div className="text-xs text-white/40 leading-relaxed space-y-2 bg-white/[0.03] rounded-xl p-4 border border-white/8">
                <p>
                  By submitting this application, I certify that all information provided is true,
                  complete, and accurate to the best of my knowledge. I understand that any false
                  statement or omission may be grounds for rejection or termination.
                </p>
                <p>
                  I authorize 1neLink to verify the information provided and contact references
                  listed above. I understand that employment may be contingent on a background check.
                </p>
                <p className="border-t border-white/8 pt-2 mt-1">
                  <strong className="text-white/60">Arbitration Agreement:</strong> I agree that any
                  dispute, claim, or controversy arising out of or relating to this application or
                  any subsequent employment relationship will be resolved exclusively through binding
                  arbitration, and I waive any right to a jury trial or participation in a class action.
                </p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input type="checkbox" name="agree" checked={form.agree} onChange={handleChange}
                    required className="peer sr-only" />
                  <div className="w-5 h-5 rounded-md border border-white/20 bg-white/5 peer-checked:bg-blue-600 peer-checked:border-blue-500 transition flex items-center justify-center">
                    {form.agree && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-white/70 group-hover:text-white/90 transition leading-snug">
                  I certify that all information provided in this application is accurate and complete,
                  and I agree to the terms above. <span className="text-red-400">*</span>
                </span>
              </label>
            </section>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(59,130,246,0.25)] hover:shadow-[0_0_32px_rgba(59,130,246,0.4)] text-sm"
            >
              {loading ? "Submitting Application…" : "Submit Application"}
            </button>

            <p className="text-xs text-white/25 text-center pb-4">
              We review every application manually — no automated rejections.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ApplyPage() {
  return <ApplyPageContent />;
}
