"use client";

import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Refund Policy</h1>
        <p className="text-sm text-white/50">Last updated: May 9, 2026</p>

        <section className="space-y-3">
          <p>
            Tips on 1neLink are voluntary payments. In most cases, completed tips are not refundable.
          </p>
          <p>
            Refunds may be considered for unauthorized charges, duplicate payments, or clear technical errors.
          </p>
          <p>
            To request a refund, contact support within 30 days of the transaction and include the receipt ID.
          </p>
          <p>
            Approved refunds are returned to the original payment method and typically settle within 5-10 business days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Chargebacks</h2>
          <p>
            If a cardholder files a chargeback through their bank, the final decision is made by the card network and issuer.
            1neLink and Stripe may request supporting evidence during the dispute process.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-white">Contact</h2>
          <p>
            Email <a className="text-white underline" href="mailto:support@1nelink.com">support@1nelink.com</a> for refund-related questions.
          </p>
        </section>

        <div className="pt-6 border-t border-white/10">
          <Link href="/legal" className="text-sm text-white/70 underline">Back to Legal</Link>
        </div>
      </div>
    </main>
  );
}
