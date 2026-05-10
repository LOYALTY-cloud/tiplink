"use client";

import Link from "next/link";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-8 text-white/80">
        <h1 className="text-3xl font-bold text-white">Legal</h1>
        <p className="text-sm text-white/50">Last updated: April 12, 2026</p>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs sm:text-sm text-white/75">
            Platform purpose: 1neLink is a creator monetization and fan support platform. Profile customization and digital offerings are optional secondary tools.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Company Information</h2>
          <p>
            1neLink is a creator monetization and fan support platform operated out of Augusta, GA, United States.
            We help creators receive tips and monetize digital creator offerings. We are not a bank.
            Payment processing services are provided by Stripe and other licensed financial institutions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Key Policies</h2>
          <div className="grid gap-3">
            <Link
              href="/terms"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Terms of Service</p>
              <p className="text-sm text-white/40 mt-1">Rules and conditions for using 1neLink</p>
            </Link>
            <Link
              href="/privacy"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Privacy Policy</p>
              <p className="text-sm text-white/40 mt-1">How we collect, use, and protect your data</p>
            </Link>
            <Link
              href="/refund-policy"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Refund Policy</p>
              <p className="text-sm text-white/40 mt-1">How refunds, chargebacks, and requests are handled</p>
            </Link>
            <Link
              href="/acceptable-use"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Acceptable Use Policy</p>
              <p className="text-sm text-white/40 mt-1">Rules for lawful platform use and payment safety</p>
            </Link>
            <Link
              href="/creator-guidelines"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Creator Guidelines</p>
              <p className="text-sm text-white/40 mt-1">Standards for creator trust, quality, and payouts</p>
            </Link>
            <Link
              href="/prohibited-content"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Prohibited Content Policy</p>
              <p className="text-sm text-white/40 mt-1">Content and behavior not allowed on 1neLink</p>
            </Link>
            <Link
              href="/marketplace/dmca"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Copyright and DMCA Policy</p>
              <p className="text-sm text-white/40 mt-1">Copyright takedown and counter-notice process</p>
            </Link>
            <Link
              href="/contact"
              className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition"
            >
              <p className="font-medium text-white">Support and Contact</p>
              <p className="text-sm text-white/40 mt-1">How to reach support, compliance, and legal teams</p>
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Regulatory Disclosures</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>1neLink facilitates payments between supporters and creators. We are not a money transmitter.</li>
            <li>All funds are held and transferred by our licensed payment processing partners.</li>
            <li>Identity verification (KYC) is handled by Stripe in accordance with applicable regulations.</li>
            <li>We comply with applicable U.S. federal and state regulations governing payment facilitation.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>
            For legal inquiries, compliance questions, or data requests:
          </p>
          <a
            href="mailto:legal@1nelink.com"
            className="inline-block text-emerald-400 hover:text-emerald-300 transition"
          >
            legal@1nelink.com
          </a>
          <p className="text-sm text-white/40 mt-2">
            For general support, contact{" "}
            <a href="mailto:support@1nelink.com" className="text-emerald-400 hover:text-emerald-300 transition">
              support@1nelink.com
            </a>
          </p>
        </section>

        <div className="pt-4 border-t border-white/10">
          <Link href="/" className="text-sm text-white/40 hover:text-emerald-400 transition">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
