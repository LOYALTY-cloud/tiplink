// app/legal/dmca/page.tsx

import Link from "next/link";

export const metadata = {
  title: "DMCA Policy | 1neLink",
  description: "1neLink DMCA Policy and copyright reporting procedures.",
};

// Shared prose text class
const prose = "text-white/75 leading-7";

export default function DMCAPage() {
  return (
    <main className="min-h-screen bg-[color:var(--bg0)] text-[color:var(--text)] relative [overflow-x:clip]">

      {/* Glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hidden sm:block absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="hidden sm:block absolute top-10 -right-40 h-[520px] w-[520px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent opacity-70" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-10">

        {/* Back link */}
        <Link href="/legal" className="text-blue-400 hover:text-blue-300 font-medium transition text-sm flex items-center gap-1">
          ← Legal
        </Link>

        {/* Header */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Legal</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">1neLink DMCA Policy</h1>
          <p className="text-white/45 text-sm">Last Updated: May 2026</p>
        </div>

        {/* Overview */}
        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p className={prose}>
            1neLink respects the intellectual property rights of creators,
            users, businesses, and third parties. This DMCA Policy explains
            how copyright owners may report alleged copyright infringement on
            the 1neLink platform.
          </p>
          <p className={prose}>
            1neLink operates as a creator monetization, tipping, and digital
            marketplace platform where users may:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-white/75">
            <li>Receive tips and financial support</li>
            <li>Sell digital themes and customization products</li>
            <li>Share creator content</li>
            <li>Monetize accounts and communities</li>
          </ul>

          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/[0.12] backdrop-blur-xl p-5">
            <p className={prose}>
              Users are prohibited from uploading, selling, distributing, or
              sharing content they do not own or have permission to use.
            </p>
          </div>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Reporting */}
        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-white">Reporting Copyright Infringement</h2>
          <p className={prose}>
            If you believe content on 1neLink infringes your copyright, you may
            submit a DMCA takedown request.
          </p>

          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/[0.12] backdrop-blur-xl p-5 space-y-3">
            <h3 className="font-semibold text-white">Your notice must include:</h3>
            <ol className="list-decimal pl-5 space-y-2 text-white/75">
              <li>Your full legal name</li>
              <li>Your contact email address</li>
              <li>Identification of the copyrighted work claimed to be infringed</li>
              <li>Identification of the infringing material and its location on 1neLink</li>
              <li>A statement that you have a good faith belief the use is unauthorized</li>
              <li>A statement that the information provided is accurate under penalty of perjury</li>
              <li>Your physical or electronic signature</li>
            </ol>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/[0.12] backdrop-blur-xl p-5 space-y-3">
            <p className="text-white/75">Submit DMCA notices to:</p>
            <div className="space-y-1 text-white/90 font-medium">
              <p>DMCA Email: <span className="text-blue-400">legal@1nelink.com</span></p>
              <p className="flex items-center gap-2">
                Support Center:{" "}
                <Link
                  href="/dashboard/support"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition"
                >
                  Open Support Center →
                </Link>
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/dashboard/support/dmca"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_8px_24px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-600 transition"
              >
                ⚖️ File a DMCA Complaint →
              </Link>
            </div>
          </div>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Counter notifications */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Counter Notifications</h2>
          <p className={prose}>
            If your content was removed due to a copyright claim and you believe
            the removal was made in error, you may submit a counter notification.
          </p>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Repeat infringer */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Repeat Infringer Policy</h2>
          <p className={prose}>Violations that may result in account termination include:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-white/75">
            <li>Re-uploading removed content</li>
            <li>Repeatedly selling stolen themes</li>
            <li>Repeated copyright violations</li>
            <li>Marketplace theft or impersonation</li>
          </ul>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Theme marketplace */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Theme Marketplace Protection</h2>
          <p className={prose}>Creators and sellers may not:</p>
          <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/[0.12] backdrop-blur-xl p-5">
            <ul className="list-disc pl-5 space-y-2 text-white/75">
              <li>Sell stolen themes</li>
              <li>Copy another creator&apos;s UI or branding</li>
              <li>Repackage third-party content without permission</li>
              <li>Upload malicious or deceptive digital products</li>
            </ul>
          </div>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Fraudulent claims */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Fraudulent DMCA Claims</h2>
          <p className={prose}>Filing a false DMCA claim may result in:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-white/75">
            <li>Account suspension</li>
            <li>Marketplace restrictions</li>
            <li>Permanent bans</li>
            <li>Legal liability where applicable</li>
          </ul>
        </section>

        <div className="border-t border-white/[0.08]" />

        {/* Reservation of rights */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Reservation of Rights</h2>
          <p className={prose}>1neLink reserves the right to:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-white/75">
            <li>Remove content at its discretion</li>
            <li>Restrict accounts under investigation</li>
            <li>Preserve evidence for fraud or legal review</li>
            <li>Cooperate with legal authorities when required</li>
          </ul>
        </section>

        {/* Bottom CTA */}
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.03] border border-white/[0.12] backdrop-blur-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-white">Need to report an infringement?</p>
            <p className="text-sm text-white/55 mt-0.5">Use our complaint form to submit a DMCA takedown request.</p>
          </div>
          <Link
            href="/dashboard/support/dmca"
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_8px_24px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-600 transition whitespace-nowrap"
          >
            File a Complaint →
          </Link>
        </div>

      </div>
    </main>
  );
}
