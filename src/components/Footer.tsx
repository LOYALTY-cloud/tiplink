"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { Shield, Zap, Heart } from "lucide-react";

export default function Footer() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <>
      {/* ━━━ PRE-FOOTER CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="text-center py-6"
      >
        <p className="text-sm text-white/55 tracking-wide">
          No signup required to send tips.
        </p>
      </motion.div>

      {/* ━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer
        ref={ref}
        className="relative border-t border-white/[0.06] bg-gradient-to-b from-transparent via-[#050a1a]/80 to-[#020510] backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-3xl mx-auto px-6 pt-10 pb-8 flex flex-col items-center gap-7"
        >
          {/* ── Brand ─────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2.5">
              <Image
                src="/1nelink-logo.png"
                alt="1neLink"
                width={28}
                height={28}
                className="rounded-md"
              />
              <span className="text-lg font-bold tracking-tight text-white/90">
                1neLink
              </span>
            </div>
            <p className="text-sm text-white/55 tracking-wide">
              Creator payments, simplified.
            </p>
          </div>

          {/* ── Links ─────────────────────────────────────────── */}
          <nav className="flex items-center gap-6 text-sm text-white/45">
            <Link
              href="/terms"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              Terms
            </Link>
            <span className="text-white/15 select-none">·</span>
            <Link
              href="/privacy"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              Privacy
            </Link>
            <span className="text-white/15 select-none">·</span>
            <Link
              href="/legal"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              Legal
            </Link>
            <span className="text-white/15 select-none">·</span>
            <Link
              href="/support"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              Support
            </Link>
            <span className="text-white/15 select-none">·</span>
            <Link
              href="/legal/dmca"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              DMCA
            </Link>
            <span className="text-white/15 select-none">·</span>
            <Link
              href="/legal/community-guidelines"
              className="hover:text-emerald-400 transition-colors duration-200"
            >
              Community Guidelines
            </Link>
          </nav>

          {/* ── Identity ──────────────────────────────────────── */}
          <p className="text-xs text-white/45 tracking-wide">
            &copy; {new Date().getFullYear()} 1neLink &bull; Augusta, GA
            &nbsp;&middot;&nbsp;
            <a
              href="https://www.1nelink.com"
              className="hover:text-emerald-400 transition-colors duration-200"
              target="_blank"
              rel="noopener noreferrer"
            >
              www.1nelink.com
            </a>
          </p>

          {/* ── Trust badge ───────────────────────────────────── */}
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-medium text-white/55 tracking-widest uppercase select-none">
            <Shield size={12} className="text-emerald-400/70" />
            Secure
            <span className="text-white/15">•</span>
            <Zap size={12} className="text-emerald-400/70" />
            Fast
            <span className="text-white/15">•</span>
            <Heart size={12} className="text-emerald-400/70" />
            Creator-first
          </div>

          {/* ── Legal disclaimers ─────────────────────────────── */}
          <div className="max-w-lg text-center space-y-2">
            <p className="text-[11px] leading-relaxed text-white/25">
              1neLink is a payment facilitation platform, not a bank. Payment
              services are provided by third-party financial institutions.
            </p>
            <p className="text-[11px] leading-relaxed text-white/25">
              Payments are processed securely by our payment partners.
            </p>
            <p className="text-[11px] leading-relaxed text-white/25">
              Legal inquiries:{" "}
              <a
                href="mailto:legal@1nelink.com"
                className="text-white/50 hover:text-emerald-400 transition-colors duration-200"
              >
                legal@1nelink.com
              </a>
            </p>
          </div>
        </motion.div>
      </footer>
    </>
  );
}
