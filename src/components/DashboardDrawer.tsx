"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type Item = { label: string; href?: string; onClick?: () => Promise<void> | void };

export function DashboardDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function handleLogout() {
    await supabase.auth.signOut();
    onClose();
    router.push("/login");
  }

  const items: Item[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Earnings", href: "/dashboard/earnings" },
    { label: "Profile", href: "/dashboard/profile" },
    { label: "Share", href: "/dashboard/share" },
    { label: "Transactions", href: "/dashboard/transactions" },
    { label: "Wallet", href: "/dashboard/wallet" },
    { label: "Account", href: "/dashboard/account" },
    { label: "Account & Settings", href: "/dashboard/settings" },
    { label: "Help & Support", href: "/dashboard/support" },
    { label: "Log out", onClick: handleLogout },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        aria-label="Close menu"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className={`${ui.card} absolute left-0 top-0 h-full w-[80%] max-w-[300px] border-r border-white/10 transform transition-transform duration-300 translate-x-0`}>
        <div className={`flex items-center justify-between px-4 py-4 border-b border-white/10`}>
          <div className="flex items-center gap-2">
            <img src="/1nelink-logo.png" alt="1neLink" className="h-7 w-7 rounded-lg object-contain" />
            <div>
              <div className={`text-xs font-medium ${ui.muted}`}>1NELINK</div>
              <div className={`text-sm font-semibold ${ui.muted}`}>Menu</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`${ui.btnGhost} px-2 py-1 ${ui.btnSmall}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <nav className="p-2">
          {items.map((it) => {
            const active = it.href && (pathname === it.href || pathname?.startsWith(it.href + "/"));
            const cls = active ? ui.navActive : ui.navIdle;

            if (it.href) {
              return (
                <Link
                  key={it.label}
                  href={it.href}
                  onClick={onClose}
                  className={`${cls} w-full flex items-center gap-3`}
                >
                  <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                  {it.label}
                </Link>
              );
            }

            return (
              <button
                key={it.label}
                onClick={async () => {
                  await it.onClick?.();
                }}
                className={`${cls} w-full flex items-center gap-3`}
              >
                <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                {it.label}
              </button>
            );
          })}
        </nav>

        <div className={`absolute bottom-0 left-0 right-0 p-4 border-t border-white/10`}>
          {/* Removed: Private by default • Receipts included • No feeds • No DMs */}
        </div>
      </aside>
    </div>
  );
}
