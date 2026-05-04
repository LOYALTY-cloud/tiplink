"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ApplicationForm() {
  const steps = ["Identity", "Creator Type", "Experience", "Portfolio", "Intent", "Account Setup"] as const;
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [limit, setLimit] = useState(10);
  const [limitReached, setLimitReached] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "",
    experience: "",
    work: "",
    portfolio: "",
    intent: "",
    displayName: "",
    handle: "",
  });

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canContinue =
    (step === 0 && form.name.trim() !== "" && form.email.trim() !== "") ||
    (step === 1 && form.type !== "") ||
    (step === 2 && form.experience !== "" && (form.experience === "No" || form.work.trim() !== "")) ||
    (step === 3 && form.portfolio.trim() !== "") ||
    (step === 4 && form.intent.trim() !== "") ||
    (step === 5 && form.displayName.trim() !== "" && form.handle.trim() !== "");

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/elite-creator/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          creator_type: form.type,
          experience: form.experience,
          work: form.work,
          portfolio: form.portfolio,
          intent: form.intent,
          display_name: form.displayName,
          handle: form.handle.replace(/^@/, ""),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit application.");

      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function checkLimit() {
      try {
        const res = await fetch("/api/elite-creator/availability", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !active) return;

        setApprovedCount(typeof json.approvedCount === "number" ? json.approvedCount : 0);
        setLimit(typeof json.limit === "number" ? json.limit : 10);
        setLimitReached(Boolean(json.limitReached));
      } catch {
        // Silent fallback: form remains available if availability check fails.
      }
    }

    checkLimit();
    return () => {
      active = false;
    };
  }, []);

  if (limitReached && !submitted) {
    return (
      <section className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-[11px] tracking-[0.24em] text-white/75 uppercase mb-3">
            Elite Creator Application Apply Now
          </p>
          <h2 className="text-2xl font-semibold">Elite Creator Program Full</h2>
          <p className="text-white/60 mt-3">
            Only a limited number of creators are accepted to maintain quality. New spots will open soon.
          </p>
          <p className="text-sm text-white/60 mt-5">
            {approvedCount}/{limit} Elite Creator spots filled
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <p className="text-[11px] tracking-[0.24em] text-white/75 uppercase mb-2">
            Elite Creator Application Apply Now
          </p>
          <div className="text-sm text-white/60">Step {step + 1} of {steps.length}</div>
          <div className="w-full h-1 bg-white/10 mt-2 rounded">
            <div
              className="h-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded transition-all duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-white/45">{steps[step]}</div>
          <p className="text-sm text-white/60 mt-2">
            {approvedCount}/{limit} Elite Creator spots filled
          </p>
        </div>

        {submitted ? (
          <div className="text-center p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-4xl mb-2">✓</div>
            <h3 className="text-xl font-semibold text-emerald-400 mb-2">
              Application Received
            </h3>
            <p className="text-white/70">
              We&apos;ll review your application and get back to you within 48 hours.
            </p>
          </div>
        ) : (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="identity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-4">Tell us about you</h2>
                  <input
                    placeholder="Name"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                  <input
                    placeholder="Email"
                    className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="type" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-4">What kind of creator are you?</h2>
                  {["Designer", "Content Creator", "Influencer", "Developer", "Other"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update("type", type)}
                      className={`w-full px-3 py-3 rounded-xl bg-white/5 mb-2 text-left border ${form.type === type ? "border-pink-500 bg-pink-500/10" : "border-transparent"}`}
                    >
                      {type}
                    </button>
                  ))}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="experience" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-4">Any experience in editing (Yes/No)</h2>
                  {["Yes", "No"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => update("experience", val)}
                      className={`w-full px-3 py-3 rounded-xl bg-white/5 mb-2 text-left border ${form.experience === val ? "border-pink-500 bg-pink-500/10" : "border-transparent"}`}
                    >
                      {val}
                    </button>
                  ))}

                  {form.experience === "Yes" && (
                    <input
                      placeholder="Work sample text (only if experience = Yes)"
                      className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                      value={form.work}
                      onChange={(e) => update("work", e.target.value)}
                    />
                  )}
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-4">Portfolio/social link</h2>
                  <input
                    placeholder="Portfolio / Social Link"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                    value={form.portfolio}
                    onChange={(e) => update("portfolio", e.target.value)}
                  />
                  <p className="text-xs text-white/50 mt-2">TikTok, Instagram, website, etc.</p>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="intent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-4">Intent (why they want to join)</h2>
                  <textarea
                    rows={4}
                    placeholder="Intent (why they want to join)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                    value={form.intent}
                    onChange={(e) => update("intent", e.target.value)}
                  />
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="account" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-semibold mb-1">Account Setup</h2>
                  <p className="text-sm text-white/50 mb-4">
                    If approved, we&apos;ll create your account using these details. You&apos;ll receive a link to set your password.
                  </p>
                  <input
                    placeholder="Display Name"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 outline-none focus:border-pink-500"
                    value={form.displayName}
                    onChange={(e) => update("displayName", e.target.value)}
                  />
                  <div className="relative mt-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
                    <input
                      placeholder="handle"
                      className="w-full rounded-xl border border-white/10 bg-white/5 pl-7 pr-3 py-3 outline-none focus:border-pink-500 lowercase"
                      value={form.handle}
                      onChange={(e) => update("handle", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-2">Letters, numbers, and underscores only.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between mt-6 items-center">
              {step > 0 ? (
                <button type="button" onClick={back} className="text-white/60 hover:text-white transition-colors">
                  Back
                </button>
              ) : (
                <span />
              )}

              {step < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={!canContinue}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={loading || !canContinue}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "Submitting..." : "Apply to Join"}
                </button>
              )}
            </div>

            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}
