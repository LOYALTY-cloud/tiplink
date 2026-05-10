"use client";

import Link from "next/link";

export default function AcceptableUsePage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Acceptable Use Policy</h1>
        <p className="text-sm text-white/50">Last updated: May 9, 2026</p>

        <section className="space-y-3">
          <p>You may use 1neLink only for lawful creator monetization, fan support, and digital creator offerings.</p>
          <p>By using the platform, you agree not to engage in fraud, impersonation, deceptive claims, or unlawful activity.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Prohibited Behaviors</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>Money laundering, payment abuse, or card testing.</li>
            <li>Attempting to bypass account verification or platform controls.</li>
            <li>Using stolen content, brands, or intellectual property.</li>
            <li>Uploading malware, malicious scripts, or harmful files.</li>
            <li>Harassment, threats, or illegal content distribution.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Enforcement</h2>
          <p>
            We may limit payouts, remove content, suspend accounts, or terminate access for policy violations.
          </p>
        </section>

        <div className="pt-6 border-t border-white/10">
          <Link href="/legal" className="text-sm text-white/70 underline">Back to Legal</Link>
        </div>
      </div>
    </main>
  );
}
