"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DashboardDrawer } from "@/components/DashboardDrawer";
import { NotificationBell } from "@/components/NotificationBell";
import { ui } from "@/lib/ui";
import { useInactivity } from "@/hooks/useInactivity";
import SessionWarningModal from "@/components/SessionWarningModal";
import AccountStatusBadge from "@/components/AccountStatusBadge";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [mounted, setMounted] = useState(false);

  useInactivity();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onWarning = () => setSessionWarning(true);
    window.addEventListener("session_warning", onWarning);
    return () => {
      window.removeEventListener("session_warning", onWarning);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");

      // Auto-redirect restricted/suspended users to Account page
      const { data: prof } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      const acctStatus = (prof as { account_status?: string } | null)?.account_status;
      if (
        (acctStatus === "restricted" || acctStatus === "suspended") &&
        pathname !== "/dashboard/account" &&
        pathname !== "/dashboard/wallet" &&
        pathname !== "/dashboard/support" &&
        !pathname?.startsWith("/dashboard/support/")
      ) {
        router.replace("/dashboard/account");
      }
    })();
  }, [router, pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const tabClass = (href: string) =>
    mounted && pathname === href ? ui.navActive : ui.navIdle;

  return (
    <div className="min-h-screen">
      <header className={`sticky top-0 z-10 ${ui.cardInner}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDrawerOpen(true)}
              className={`md:hidden ${ui.btnGhost} px-3 py-2 ${ui.btnSmall}`}
              aria-label="Open menu"
            >
              ☰
            </button>

            <div className="flex items-center gap-2">
              <img src="/1nelink-logo.png" alt="1neLink" className="h-9 w-9 rounded-xl object-contain" />
              <span className={`${ui.h2} tracking-tight`}>1NELINK</span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <Link className={tabClass("/dashboard")} href="/dashboard">
                Overview
              </Link>
              <Link className={tabClass("/dashboard/profile")} href="/dashboard/profile">
                Profile
              </Link>
              <Link className={tabClass("/dashboard/share")} href="/dashboard/share">
                Share
              </Link>
              <Link className={tabClass("/dashboard/transactions")} href="/dashboard/transactions">
                Transactions
              </Link>
              <Link className={tabClass("/dashboard/wallet")} href="/dashboard/wallet">
                Wallet
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <AccountStatusBadge />
            <NotificationBell />

            <div className="hidden md:block text-right">
              <div className={`text-xs ${ui.muted}`}>Signed in</div>
              <div className={`text-sm ${ui.muted}`}>{email}</div>
            </div>

            {/* Desktop menu */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className={`${ui.btnGhost} px-3 py-2 text-lg`}
                aria-label="Account menu"
              >
                ☰
              </button>
              {menuOpen && (
                <>
                  <button
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                  />
                  <div className={`absolute right-0 mt-2 w-48 z-30 ${ui.card} border border-white/10 rounded-xl py-1 shadow-lg`}>
                    <Link
                      href="/dashboard/earnings"
                      onClick={() => setMenuOpen(false)}
                      className={`block px-4 py-2 text-sm ${pathname === "/dashboard/earnings" ? "text-white" : "text-white/70"} hover:bg-white/5 transition`}
                    >
                      Earnings
                    </Link>
                    <Link
                      href="/dashboard/account"
                      onClick={() => setMenuOpen(false)}
                      className={`block px-4 py-2 text-sm ${pathname === "/dashboard/account" ? "text-white" : "text-white/70"} hover:bg-white/5 transition`}
                    >
                      Account
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setMenuOpen(false)}
                      className={`block px-4 py-2 text-sm ${pathname === "/dashboard/settings" ? "text-white" : "text-white/70"} hover:bg-white/5 transition`}
                    >
                      Account &amp; Settings
                    </Link>
                    <Link
                      href="/dashboard/support"
                      onClick={() => setMenuOpen(false)}
                      className={`block px-4 py-2 text-sm ${pathname === "/dashboard/support" ? "text-white" : "text-white/70"} hover:bg-white/5 transition`}
                    >
                      Help &amp; Support
                    </Link>
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="block w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 transition"
                    >
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Mobile log out (drawer handles nav) */}
            <button
              onClick={logout}
              className={`md:hidden ${ui.btnGhost}`}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <DashboardDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6">{children}</main>

      <footer className="max-w-6xl mx-auto px-4 md:px-8 pb-10 pt-2 text-xs text-gray-500 flex items-center gap-4">
        <div>1NELINK • Private support • Receipts provided</div>
        <div className="ml-auto flex gap-3">
          <Link href="/terms" className="underline">Terms</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
        </div>
      </footer>

      <SessionWarningModal
        open={sessionWarning}
        onStay={() => {
          setSessionWarning(false);
          window.dispatchEvent(new Event("mousemove"));
        }}
      />
    </div>
  );
}
