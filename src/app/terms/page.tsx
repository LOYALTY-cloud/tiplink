"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        <div className="text-sm">Last updated: March 31, 2026</div>

        <section className="space-y-3">
          <p>Welcome to 1neLink (“we,” “our,” or “us”). By accessing or using our platform, you agree to these Terms.</p>

          <h2 className="font-semibold">1. Description of Service</h2>
          <p>1neLink allows users to create a profile and receive voluntary monetary tips from supporters. We do not guarantee income, transaction volume, or payment processing outcomes.</p>

          <h2 className="font-semibold">2. Payments</h2>
          <p>Payments are processed securely through Stripe. By using 1neLink, you agree to Stripe’s Connected Account Agreement and Services Agreement. We do not store full credit card details. We may deduct applicable platform fees.</p>

          <h2 className="font-semibold">3. User Responsibilities</h2>
          <p>You agree NOT to: use the platform for illegal activity; engage in fraud or deceptive practices; violate intellectual property rights; harass or abuse other users. We reserve the right to suspend accounts at our discretion.</p>

          <h2 className="font-semibold">4. Refunds</h2>
          <p>Tips are considered voluntary payments. Refunds are handled in accordance with Stripe’s policies.</p>

          <h2 className="font-semibold">5. Termination</h2>
          <p>We may suspend or terminate access at any time if terms are violated.</p>

          <h2 className="font-semibold">6. Disclaimer</h2>
          <p>1neLink is provided “as is” without warranties of any kind.</p>

          <h2 className="font-semibold">7. Fees & Charges</h2>
          <p>Tips are subject to a processing fee of 2.9% + $0.30 (charged by Stripe) and a platform fee of 1.1%. These fees are transparently displayed before each transaction is confirmed. The creator receives the full tip amount minus applicable fees.</p>

          <h2 className="font-semibold">8. Refund Policy</h2>
          <p>Tips are voluntary payments. Because tips are irrevocable gifts, we generally do not issue refunds. However, refunds may be granted in cases of: unauthorized transactions, duplicate charges, technical errors that resulted in an incorrect charge. To request a refund, contact support within 30 days of the transaction. Refunds are processed to the original payment method and may take 5–10 business days.</p>

          <h2 className="font-semibold">9. Dispute Resolution</h2>
          <p>If you have a dispute regarding a payment or account action, please contact our support team first. We will make reasonable efforts to resolve disputes within 7 business days. If unresolved, disputes may be escalated through Stripe's dispute process.</p>

          <h2 className="font-semibold">10. Contact</h2>
          <p>For questions, contact: <a className="text-white underline" href="mailto:support@1nelink.com">support@1nelink.com</a></p>
        </section>

        <div className="pt-6 border-t border-white/6">
          <Link href="/privacy" className="text-sm text-white/70 underline">Privacy Policy</Link>
        </div>
      </div>
    </main>
  );
}
