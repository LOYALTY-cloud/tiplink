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
    { label: "Profile", href: "/dashboard/profile" },
    { label: "Share", href: "/dashboard/share" },
    { label: "Transactions", href: "/dashboard/transactions" },
    { label: "Wallet", href: "/dashboard/wallet" },
    { label: "Virtual Card", href: "/dashboard/virtual-card" },
    { label: "Settings", href: "/dashboard/settings" },
    // Subscription removed
    { label: "Log out", onClick: handleLogout },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        aria-label="Close menu"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className={`${ui.card} absolute left-0 top-0 h-full w-[290px] border-r border-white/10`}>
        <div className={`flex items-center justify-between px-4 py-4 border-b border-white/10`}>
          <div>
            <div className={`text-xs font-medium ${ui.muted}`}>TIPLINKME</div>
            <div className={`text-sm font-semibold ${ui.muted}`}>Menu</div>
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
