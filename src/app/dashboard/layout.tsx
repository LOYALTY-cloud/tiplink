"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DashboardDrawer } from "@/components/DashboardDrawer";
import { ui } from "@/lib/ui";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
    })();
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const tabClass = (href: string) => (pathname === href ? ui.navActive : ui.navIdle);

  return (
    <div className="min-h-screen">
      <header className={`sticky top-0 z-10 ${ui.cardInner}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDrawerOpen(true)}
              className={`${ui.btnGhost} px-3 py-2 ${ui.btnSmall}`}
              aria-label="Open menu"
            >
              ☰
            </button>

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-black" />
              <span className={`${ui.h2} tracking-tight`}>TIPLINK</span>
            </div>

            <nav className="hidden sm:flex items-center gap-1">
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
            <div className="hidden md:block text-right">
              <div className={`text-xs ${ui.muted}`}>Signed in</div>
              <div className={`text-sm ${ui.muted}`}>{email}</div>
            </div>

            <button
              onClick={logout}
              className={`${ui.btnGhost}`}
            >
              Log out
            </button>
          </div>
        </div>

        <div className="sm:hidden border-t">
          <div className="max-w-6xl mx-auto px-2 py-2 flex gap-1 overflow-x-auto">
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
          </div>
        </div>
      </header>

      <DashboardDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>

      <footer className="max-w-6xl mx-auto px-4 pb-10 pt-2 text-xs text-gray-500 flex items-center gap-4">
        <div>TIPLINK • Private support • Receipts provided</div>
        <div className="ml-auto flex gap-3">
          <Link href="/terms" className="underline">Terms</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
