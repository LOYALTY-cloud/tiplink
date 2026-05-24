// app/legal/dmca/page.tsx

export const metadata = {
  title: "DMCA Policy | 1neLink",
  description:
    "1neLink DMCA Policy and copyright reporting procedures.",
};

export default function DMCAPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-4">1neLink DMCA Policy</h1>

        <p className="text-zinc-400 mb-12">
          Last Updated: May 2026
        </p>

        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-3">Overview</h2>

            <p className="text-zinc-300 leading-7">
              1neLink respects the intellectual property rights of creators,
              users, businesses, and third parties. This DMCA Policy explains
              how copyright owners may report alleged copyright infringement on
              the 1neLink platform.
            </p>
          </div>

          <div>
            <p className="text-zinc-300 leading-7">
              1neLink operates as a creator monetization, tipping, and digital
              marketplace platform where users may:
            </p>

            <ul className="list-disc pl-6 mt-4 space-y-2 text-zinc-300">
              <li>Receive tips and financial support</li>
              <li>Sell digital themes and customization products</li>
              <li>Share creator content</li>
              <li>Monetize accounts and communities</li>
            </ul>
          </div>

          <div className="border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
            <p className="text-zinc-300 leading-7">
              Users are prohibited from uploading, selling, distributing, or
              sharing content they do not own or have permission to use.
            </p>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Reporting Copyright Infringement
          </h2>

          <p className="text-zinc-300 leading-7">
            If you believe content on 1neLink infringes your copyright, you may
            submit a DMCA takedown request.
          </p>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">
              Your notice must include:
            </h3>

            <ol className="list-decimal pl-6 space-y-3 text-zinc-300">
              <li>Your full legal name</li>
              <li>Your contact email address</li>
              <li>
                Identification of the copyrighted work claimed to be infringed
              </li>
              <li>
                Identification of the infringing material and its location on
                1neLink
              </li>
              <li>
                A statement that you have a good faith belief the use is
                unauthorized
              </li>
              <li>
                A statement that the information provided is accurate under
                penalty of perjury
              </li>
              <li>Your physical or electronic signature</li>
            </ol>
          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">
            <p className="text-zinc-300">
              Submit DMCA notices to:
            </p>

            <div className="mt-4 text-zinc-100">
              <p>DMCA Email: legal@1nelink.com</p>
              <p>
                Support Center:{" "}
                <a
                  href="/dashboard/support"
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                >
                  /dashboard/support
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Counter Notifications
          </h2>

          <p className="text-zinc-300 leading-7">
            If your content was removed due to a copyright claim and you believe
            the removal was made in error, you may submit a counter
            notification.
          </p>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Repeat Infringer Policy
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Re-uploading removed content</li>
            <li>Repeatedly selling stolen themes</li>
            <li>Repeated copyright violations</li>
            <li>Marketplace theft or impersonation</li>
          </ul>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Theme Marketplace Protection
          </h2>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
            <ul className="list-disc pl-6 space-y-2 text-zinc-300">
              <li>Sell stolen themes</li>
              <li>Copy another creator&apos;s UI or branding</li>
              <li>
                Repackage third-party content without permission
              </li>
              <li>Upload malicious or deceptive digital products</li>
            </ul>
          </div>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Fraudulent DMCA Claims
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Account suspension</li>
            <li>Marketplace restrictions</li>
            <li>Permanent bans</li>
            <li>Legal liability where applicable</li>
          </ul>
        </section>

        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-semibold">
            Reservation of Rights
          </h2>

          <ul className="list-disc pl-6 space-y-2 text-zinc-300">
            <li>Remove content at its discretion</li>
            <li>Restrict accounts under investigation</li>
            <li>Preserve evidence for fraud or legal review</li>
            <li>Cooperate with legal authorities when required</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
