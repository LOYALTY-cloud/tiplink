// app/legal/community-guidelines/page.tsx

export const metadata = {
  title: "Community Guidelines | 1neLink",
  description:
    "1neLink community guidelines and platform safety rules.",
};

export default function CommunityGuidelinesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-4">
          1neLink Community Guidelines
        </h1>

        <p className="text-zinc-400 mb-12">
          Last Updated: May 2026
        </p>

        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-3">
              Welcome to 1neLink
            </h2>

            <p className="text-zinc-300 leading-7">
              1neLink is a creator monetization and tipping platform designed to
              help creators connect with supporters, monetize their content, and
              sell digital themes safely.
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">
              These guidelines protect:
            </h3>

            <ul className="list-disc pl-6 space-y-2 text-zinc-300">
              <li>Creators</li>
              <li>Supporters and customers</li>
              <li>Marketplace integrity</li>
              <li>Payment safety</li>
              <li>User trust</li>
              <li>Platform security</li>
            </ul>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Respect Other Users
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Harass or threaten others</li>
            <li>Engage in hate speech</li>
            <li>Encourage violence</li>
            <li>Spam or manipulate engagement</li>
          </ul>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Fraud and Scam Prevention
          </h2>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
            <ul className="list-disc pl-6 space-y-2 text-zinc-300">
              <li>Scam fundraising</li>
              <li>Fraudulent creator accounts</li>
              <li>Fake giveaways</li>
              <li>Payment fraud</li>
              <li>Chargeback abuse</li>
              <li>Impersonation</li>
              <li>Selling fake digital products</li>
              <li>Manipulating tipping systems</li>
            </ul>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Theme Marketplace Rules
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Upload stolen themes</li>
            <li>Copy another creator&apos;s branding or designs</li>
            <li>Include malware or harmful code</li>
            <li>Mislead buyers with fake previews</li>
          </ul>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Reporting Violations
          </h2>

          <p className="text-zinc-300 leading-7">
            Users can report fraud, harassment, copyright violations,
            impersonation, payment abuse, and malicious content through:
          </p>

          <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
            <p className="text-zinc-100">
              /dashboard/support
            </p>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Moderation and Enforcement
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Remove content</li>
            <li>Restrict features</li>
            <li>Suspend accounts</li>
            <li>Remove marketplace access</li>
            <li>Freeze payouts during investigations</li>
            <li>Permanently ban users</li>
          </ul>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Payment and Payout Safety
          </h2>

          <p className="text-zinc-300 leading-7">
            To maintain platform integrity and payment processor compliance,
            1neLink may delay or review payouts, require creator verification,
            investigate suspicious transactions, and restrict accounts under
            fraud review.
          </p>
        </section>

        <section className="mt-14 border-t border-zinc-800 pt-10">
          <p className="text-zinc-400 leading-7">
            By using 1neLink, users agree to follow these Community Guidelines,
            the Terms of Service, and all applicable platform policies.
          </p>
        </section>
      </div>
    </main>
  );
}
