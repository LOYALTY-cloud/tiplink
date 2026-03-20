"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type SearchResult = {
  type: "user" | "transaction" | "tip";
  label: string;
  sub: string;
  href: string;
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userData.user.id)
        .single();

      const adminRoles = ["owner", "super_admin", "finance_admin", "support_admin"];
      if (!profile?.role || !adminRoles.includes(profile.role)) {
        router.replace("/dashboard");
        return;
      }

      setEmail(userData.user.email ?? "");
      setLoading(false);
    })();
  }, [router]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(searchQuery.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  async function runSearch(q: string) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const results: SearchResult[] = [];

    for (const p of data.users ?? []) {
      results.push({
        type: "user",
        label: p.display_name || p.handle || p.user_id.slice(0, 12),
        sub: p.email || `@${p.handle}` || p.user_id,
        href: `/admin/users/${p.user_id}`,
      });
    }

    for (const t of data.tips ?? []) {
      results.push({
        type: "tip",
        label: `Tip ${t.id.slice(0, 12)}…`,
        sub: `$${Number(t.tip_amount).toFixed(2)} · ${new Date(t.created_at).toLocaleDateString()}`,
        href: `/admin/users/${t.creator_user_id}`,
      });
    }

    for (const tx of data.transactions ?? []) {
      results.push({
        type: "transaction",
        label: `${tx.type} · $${Math.abs(tx.amount).toFixed(2)}`,
        sub: tx.reference_id ?? tx.id,
        href: `/admin/users/${tx.user_id}`,
      });
    }

    setSearchResults(results);
    setSearchOpen(results.length > 0);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className={ui.muted}>Loading…</p>
      </div>
    );
  }

  const tabClass = (href: string) =>
    `px-3 py-2 text-sm font-medium transition ${
      pathname === href ? ui.navActive : ui.navIdle
    }`;

  const adminNavItems = [
    { label: "Overview", href: "/admin" },
    { label: "Users", href: "/admin/users" },
    { label: "Transactions", href: "/admin/transactions" },
    { label: "Refunds", href: "/admin/refunds" },
    { label: "Approvals", href: "/admin/approvals" },
    { label: "Disputes", href: "/admin/disputes" },
    { label: "Logs", href: "/admin/logs" },
  ];

  return (
    <div className="min-h-screen">
      <header className={`sticky top-0 z-10 ${ui.cardInner}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setAdminDrawerOpen(true)}
              className={`md:hidden ${ui.btnGhost} px-3 py-2 ${ui.btnSmall}`}
              aria-label="Open menu"
            >
              ☰
            </button>

            <Link href="/admin" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-red-600/80" />
              <span className={`${ui.h2} tracking-tight`}>ADMIN</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link className={tabClass("/admin")} href="/admin">
                Overview
              </Link>
              <Link className={tabClass("/admin/users")} href="/admin/users">
                Users
              </Link>
              <Link className={tabClass("/admin/transactions")} href="/admin/transactions">
                Transactions
              </Link>
              <Link className={tabClass("/admin/refunds")} href="/admin/refunds">
                Refunds
              </Link>
              <Link className={tabClass("/admin/approvals")} href="/admin/approvals">
                Approvals
              </Link>
              <Link className={tabClass("/admin/disputes")} href="/admin/disputes">
                Disputes
              </Link>
              <Link className={tabClass("/admin/logs")} href="/admin/logs">
                Logs
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Everywhere */}
            <div ref={searchRef} className="relative hidden md:block">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user / email / payment ID…"
                className={`${ui.input} !py-2 !px-3 !text-sm w-[280px]`}
              />
              {searchOpen && searchResults.length > 0 && (
                <div className={`absolute top-full mt-1 left-0 w-[360px] ${ui.card} p-2 max-h-[360px] overflow-y-auto z-50`}>
                  {searchResults.map((r, i) => (
                    <Link
                      key={`${r.href}-${i}`}
                      href={r.href}
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                      className="block px-3 py-2 rounded-lg hover:bg-white/10 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase ${
                          r.type === "user" ? "text-blue-400" :
                          r.type === "tip" ? "text-green-400" :
                          "text-orange-400"
                        }`}>
                          {r.type}
                        </span>
                        <span className="text-sm font-medium truncate">{r.label}</span>
                      </div>
                      <p className={`text-xs ${ui.muted2} truncate`}>{r.sub}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden md:block text-right">
              <div className={`text-xs ${ui.muted2}`}>Admin</div>
              <div className={`text-sm ${ui.muted}`}>{email}</div>
            </div>
            <Link href="/dashboard" className={ui.btnGhost}>
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Admin mobile drawer */}
      {adminDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setAdminDrawerOpen(false)}
          />
          <aside className={`${ui.card} absolute left-0 top-0 h-full w-[80%] max-w-[300px] border-r border-white/10 transform transition-transform duration-300 translate-x-0`}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div>
                <div className={`text-xs font-medium text-red-400`}>ADMIN</div>
                <div className={`text-sm font-semibold ${ui.muted}`}>Navigation</div>
              </div>
              <button
                onClick={() => setAdminDrawerOpen(false)}
                className={`${ui.btnGhost} px-2 py-1 ${ui.btnSmall}`}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <nav className="p-2">
              {adminNavItems.map((it) => {
                const active = pathname === it.href || (it.href !== "/admin" && pathname?.startsWith(it.href));
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setAdminDrawerOpen(false)}
                    className={`${active ? ui.navActive : ui.navIdle} w-full flex items-center gap-3`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                    {it.label}
                  </Link>
                );
              })}
              <div className="border-t border-white/10 mt-2 pt-2">
                <Link
                  href="/dashboard"
                  onClick={() => setAdminDrawerOpen(false)}
                  className={`${ui.navIdle} w-full flex items-center gap-3`}
                >
                  <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                  ← Dashboard
                </Link>
              </div>
            </nav>
          </aside>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">{children}</main>
    </div>
  );
}
