import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Careers – 1neLink",
  description: "Join the 1neLink team building the future of creator payments. Open positions in engineering, operations, and finance.",
};

const OPENINGS = [
  {
    title: "Backend Engineer",
    team: "Engineering",
    teamColor: "blue",
    level: "Mid–Senior",
    type: "Full-time",
    location: "Remote",
    description:
      "Design and ship the distributed systems powering creator payouts at scale — APIs, webhooks, payout infrastructure, and real-money reliability at volume.",
  },
  {
    title: "Fintech Engineer",
    team: "Engineering",
    teamColor: "blue",
    level: "Mid–Senior",
    type: "Full-time",
    location: "Remote",
    description:
      "Build Stripe Connect integrations, payout flows, and the financial primitives that make instant creator payments possible.",
  },
  {
    title: "Security Engineer",
    team: "Security",
    teamColor: "red",
    level: "Senior",
    type: "Full-time",
    location: "Remote",
    description:
      "Own security across the full stack — threat detection, payout authorization review, and keeping creator funds protected at every layer.",
  },
  {
    title: "Customer Support",
    team: "Operations",
    teamColor: "green",
    level: "Entry–Mid",
    type: "Full-time",
    location: "Remote",
    description:
      "Be the first point of contact for creators with payment issues. Resolve disputes, surface fraud patterns, and build the trust that retains creators.",
  },
  {
    title: "Trust & Safety",
    team: "Operations",
    teamColor: "green",
    level: "Mid",
    type: "Full-time",
    location: "Remote",
    description:
      "Protect the platform from fraud, abuse, and bad actors. Design risk rules, review flagged accounts, and maintain ecosystem health.",
  },
  {
    title: "Payments Operations",
    team: "Finance",
    teamColor: "purple",
    level: "Mid–Senior",
    type: "Full-time",
    location: "Remote",
    description:
      "Oversee payout reconciliation, dispute resolution, and Stripe Connect health. Bridge the gap between finance and engineering.",
  },
] as const;

const TEAM_BADGE: Record<string, string> = {
  blue:   "bg-blue-500/15 text-blue-300 border border-blue-500/25",
  red:    "bg-red-500/15 text-red-300 border border-red-500/25",
  green:  "bg-green-500/15 text-green-300 border border-green-500/25",
  purple: "bg-purple-500/15 text-purple-300 border border-purple-500/25",
};

const VALUES = [
  {
    icon: "⚡",
    title: "Move with precision",
    body: "Payments don't get second chances. We ship fast and correct, because the cost of being wrong is someone not getting paid.",
  },
  {
    icon: "🎯",
    title: "Creator-first, always",
    body: "Every decision starts with the creators and sellers depending on us. We build what they actually need, not what's easiest to build.",
  },
  {
    icon: "🔒",
    title: "Security is a feature",
    body: "We treat security as a first-class product concern — not a checklist. Trust is earned through execution, not policy documents.",
  },
];

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-[#050A1A] text-white">
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-indigo-700/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-700/8 rounded-full blur-[100px]" />
      </div>

      {/* ── Nav bar ── */}
      <header className="relative z-10 border-b border-white/[0.06] backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">
            1ne<span className="text-blue-400">Link</span>
          </Link>
          <a
            href="#roles"
            className="text-sm text-white/60 hover:text-white transition flex items-center gap-1.5"
          >
            View open roles
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-28 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-blue-400 mb-8 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          We&rsquo;re Hiring — {OPENINGS.length} Open Positions
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
          Build the future of
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-300 to-indigo-400">
            creator payments.
          </span>
        </h1>
        <p className="text-lg text-white/55 max-w-2xl mx-auto mb-12 leading-relaxed">
          1neLink is growing fast. We&rsquo;re looking for builders who care deeply about financial
          infrastructure, creator independence, and moving with urgency.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#roles"
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold px-8 py-3.5 rounded-xl shadow-[0_0_24px_rgba(59,130,246,0.3)] hover:shadow-[0_0_36px_rgba(59,130,246,0.45)] transition-all duration-200 text-sm"
          >
            View Open Roles →
          </a>
          <Link
            href="/careers/apply"
            className="text-sm text-white/50 hover:text-white/80 transition border border-white/10 hover:border-white/20 rounded-xl px-6 py-3.5"
          >
            Send a general application
          </Link>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ── Values ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        <p className="text-xs text-white/35 font-medium uppercase tracking-widest mb-10 text-center">
          How We Work
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-6 flex flex-col gap-3"
            >
              <span className="text-2xl">{v.icon}</span>
              <h3 className="font-semibold text-white">{v.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ── Open Positions ── */}
      <section id="roles" className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        <div className="flex items-center gap-4 mb-10">
          <div>
            <p className="text-xs text-white/35 font-medium uppercase tracking-widest mb-1">
              Open Positions
            </p>
            <h2 className="text-2xl font-bold">
              {OPENINGS.length} roles across engineering, operations &amp; finance
            </h2>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {OPENINGS.map((role) => (
            <div
              key={role.title}
              className="group rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 backdrop-blur-xl p-6 flex flex-col sm:flex-row sm:items-center gap-5 transition-colors duration-200"
            >
              {/* Left */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h3 className="font-semibold text-white text-base">{role.title}</h3>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${TEAM_BADGE[role.teamColor]}`}>
                    {role.team}
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed mb-3 max-w-xl">
                  {role.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {[role.type, role.location, role.level].map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-white/40 bg-white/5 border border-white/[0.08] rounded-full px-3 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="shrink-0">
                <Link
                  href={`/careers/apply?role=${encodeURIComponent(role.title)}`}
                  className="inline-flex items-center gap-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/25 hover:border-blue-500/50 text-blue-300 font-medium px-5 py-2.5 rounded-xl text-sm transition-all duration-200 whitespace-nowrap"
                >
                  Apply Now
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom callout ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-10 text-center">
          <p className="text-white/60 text-sm mb-2">
            Don&rsquo;t see a role that fits?
          </p>
          <p className="text-white font-semibold text-lg mb-4">
            We&rsquo;re always interested in exceptional people.
          </p>
          <Link
            href="/careers/apply"
            className="inline-block text-sm text-blue-400 hover:text-blue-300 transition border border-blue-500/30 hover:border-blue-500/50 rounded-xl px-6 py-2.5"
          >
            Send a general application →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between text-xs text-white/25">
          <span>© {new Date().getFullYear()} 1neLink, Inc.</span>
          <Link href="/privacy" className="hover:text-white/50 transition">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
