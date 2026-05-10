"use client";

import Link from "next/link";

export default function CreatorGuidelinesPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Creator Guidelines</h1>
        <p className="text-sm text-white/50">Last updated: May 9, 2026</p>

        <section className="space-y-3">
          <p>
            1neLink is built for creators monetizing through tips, fan support, and digital creator offerings.
          </p>
          <p>
            Keep profile and payout information accurate, complete Stripe onboarding honestly, and maintain high-quality creator conduct.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Best Practices</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>Use your real identity and valid payout details.</li>
            <li>Publish only original or properly licensed content.</li>
            <li>Respond promptly to moderation, verification, and support requests.</li>
            <li>Disclose what supporters receive when you sell digital offerings.</li>
            <li>Avoid misleading claims about earnings or endorsements.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Trust and Payout Access</h2>
          <p>
            Account trust, payout timing, and monetization access may vary based on verification status, history, and risk signals.
          </p>
        </section>

        <div className="pt-6 border-t border-white/10">
          <Link href="/legal" className="text-sm text-white/70 underline">Back to Legal</Link>
        </div>
      </div>
    </main>
  );
}
