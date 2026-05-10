"use client";

import Link from "next/link";

export default function ProhibitedContentPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Prohibited Content Policy</h1>
        <p className="text-sm text-white/50">Last updated: May 9, 2026</p>

        <section className="space-y-3">
          <p>The following content is prohibited on 1neLink:</p>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>Copyright or trademark infringement, including stolen themes/assets.</li>
            <li>Malware, exploit code, or malicious files.</li>
            <li>Fraud, impersonation, phishing, or payment abuse content.</li>
            <li>Illegal goods/services or unlawful instructions.</li>
            <li>Harassment, hate, threats, or explicit violent content.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Enforcement</h2>
          <p>
            Violating content may be removed immediately and may result in payout holds, account restrictions, or permanent bans.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Reporting</h2>
          <p>
            Report policy violations through support or submit copyright claims via our DMCA process.
          </p>
        </section>

        <div className="pt-6 border-t border-white/10">
          <Link href="/legal" className="text-sm text-white/70 underline">Back to Legal</Link>
        </div>
      </div>
    </main>
  );
}
