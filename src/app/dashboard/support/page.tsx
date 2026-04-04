"use client";

import Link from "next/link";
import { ui } from "@/lib/ui";

const sections = [
  {
    icon: "📖",
    title: "Help",
    desc: "Browse help topics and find answers",
    href: "/dashboard/support/help",
  },
  {
    icon: "💬",
    title: "Support Center",
    desc: "Chat with AI or a live agent",
    href: "/dashboard/support/chat",
  },
  {
    icon: "🎫",
    title: "Support Ticket",
    desc: "Submit a ticket for complex issues",
    href: "/dashboard/support/tickets",
  },
];

export default function HelpSupportPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className={ui.h1}>Help &amp; Support</h1>
        <p className={`mt-1 ${ui.muted}`}>
          Find answers, chat with support, or submit a ticket.
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`${ui.card} block px-5 py-4 hover:bg-white/[0.08] transition group`}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="font-semibold text-white group-hover:text-blue-200 transition">
                  {s.title}
                </p>
                <p className={`text-sm ${ui.muted}`}>{s.desc}</p>
              </div>
              <span className="ml-auto text-white/30 group-hover:text-white/60 transition">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
