"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-3xl mx-auto space-y-6 text-white/80">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <div className="text-sm">Last updated: February 21, 2026</div>

        <section className="space-y-3">
          <p>Your privacy matters to us.</p>

          <h2 className="font-semibold">1. Information We Collect</h2>
          <p>We may collect: Email address, Username, Payment account details (via Stripe), Basic analytics (IP, browser type). We do NOT store credit card numbers.</p>

          <h2 className="font-semibold">2. How We Use Information</h2>
          <p>We use information to provide and operate the service, process payments, improve user experience, and prevent fraud and abuse.</p>

          <h2 className="font-semibold">3. Payment Processing</h2>
          <p>Payments are processed through Stripe. Stripe may collect payment data according to its privacy policy.</p>

          <h2 className="font-semibold">4. Data Security</h2>
          <p>We use industry-standard security practices, including secure authentication via Supabase.</p>

          <h2 className="font-semibold">5. Cookies</h2>
          <p>We may use cookies or local storage for authentication and analytics.</p>

          <h2 className="font-semibold">6. Data Retention</h2>
          <p>We retain data as long as necessary to provide the service or comply with legal obligations.</p>

          <h2 className="font-semibold">7. Your Rights</h2>
          <p>You may request access to your data or deletion of your account. Contact: <a className="text-white underline" href="mailto:support@yourdomain.com">support@yourdomain.com</a></p>
        </section>

        <div className="pt-6 border-t border-white/6">
          <Link href="/terms" className="text-sm text-white/70 underline">Terms of Service</Link>
        </div>
      </div>
    </main>
  );
}
