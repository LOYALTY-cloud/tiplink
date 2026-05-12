"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DashboardDrawer } from "@/components/DashboardDrawer";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationToast } from "@/components/NotificationToast";
import { ui } from "@/lib/ui";
import { useInactivity } from "@/hooks/useInactivity";
import SessionWarningModal from "@/components/SessionWarningModal";
import AccountStatusBadge from "@/components/AccountStatusBadge";
import { GlobalToastProvider } from "@/components/GlobalToast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Detect user switches: if the signed-in user ID changes (e.g. someone logs
  // in as a different account in the same tab), force a hard reload so all
  // in-memory React state is wiped and re-fetched for the new user.
  useEffect(() => {
    let currentUserId: string | null = null;

    supabase.auth.getUser().then(({ data }) => {
      currentUserId = data.user?.id ?? null;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      if (currentUserId !== null && newUserId !== null && newUserId !== currentUserId) {
        // Different user — hard reload to flush all React state
        window.location.reload();
        return;
      }
      currentUserId = newUserId;
    });

    return () => subscription.unsubscribe();
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
        pathname !== "/dashboard/account/verify" &&
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
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-black/30 border-b border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between relative">

          {/* LEFT */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition"
              aria-label="Open menu"
            >
              ☰
            </button>

            {/* Desktop logo */}
            <div className="hidden md:flex items-center gap-3">
              <img
                src="/1nelink-logo-clean.png"
                alt="1neLink"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>

          {/* CENTER (mobile logo only) */}
          <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
            <img
              src="/1nelink-icon.png"
              alt="1neLink"
              className="h-8 w-8 object-contain"
            />
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            <AccountStatusBadge />
            <NotificationBell />

            {/* Desktop menu — opens the same DashboardDrawer */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="hidden md:flex w-9 h-9 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Desktop nav (separate row) */}
        <div className="hidden md:flex border-t border-white/[0.08]">
          <div className="max-w-5xl mx-auto px-8 h-11 flex items-center gap-2">
            <Link className={tabClass("/dashboard")} href="/dashboard">Overview</Link>
            <Link className={tabClass("/dashboard/profile")} href="/dashboard/profile">Profile</Link>
            <Link className={tabClass("/dashboard/share")} href="/dashboard/share">Share</Link>
            <Link className={tabClass("/dashboard/transactions")} href="/dashboard/transactions">Transactions</Link>
            <Link className={tabClass("/dashboard/wallet")} href="/dashboard/wallet">Wallet</Link>
          </div>
        </div>
      </header>

      <DashboardDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <NotificationToast />
      <GlobalToastProvider />

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-5">{children}</main>

      <footer className="max-w-5xl mx-auto px-4 md:px-8 pb-10 pt-2 text-xs text-white/45 flex items-center gap-4">
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
