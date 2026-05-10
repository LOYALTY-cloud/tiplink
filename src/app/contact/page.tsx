"use client";

import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Support and Contact</h1>
        <p className="text-sm text-white/50">Last updated: May 9, 2026</p>

        <section className="space-y-3">
          <p>Need help with payouts, account verification, moderation, or policy questions? Contact us directly.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Email</h2>
          <p>
            General support: <a className="text-white underline" href="mailto:support@1nelink.com">support@1nelink.com</a>
          </p>
          <p>
            Legal/compliance: <a className="text-white underline" href="mailto:legal@1nelink.com">legal@1nelink.com</a>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Response Times</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>General support: typically within 1-2 business days.</li>
            <li>Account or payout verification issues: typically within 1 business day.</li>
            <li>DMCA and legal requests: typically within 5-10 business days.</li>
          </ul>
        </section>

        <div className="pt-6 border-t border-white/10">
          <Link href="/legal" className="text-sm text-white/70 underline">Back to Legal</Link>
        </div>
      </div>
    </main>
  );
}
