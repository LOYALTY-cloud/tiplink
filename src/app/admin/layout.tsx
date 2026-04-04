"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { ui } from "@/lib/ui";
import SupportTransferModal from "@/components/admin/SupportTransferModal";
import { useInactivity } from "@/hooks/useInactivity";
import SessionWarningModal from "@/components/SessionWarningModal";
import { guardFetch, unguardFetch } from "@/lib/guardedFetch";
import AIAssistToggle from "@/components/admin/AIAssistToggle";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import FraudAlertsBanner from "@/components/admin/FraudAlertsBanner";
import AdminAlertProvider from "@/components/admin/AdminAlertProvider";

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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [restrictedUntil, setRestrictedUntil] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Admin: tighter 5-min timeout, 4-min warning
  useInactivity(5 * 60 * 1000, 4 * 60 * 1000);

  useEffect(() => {
    const onWarning = () => setSessionWarning(true);

    window.addEventListener("session_warning", onWarning);

    return () => {
      window.removeEventListener("session_warning", onWarning);
    };
  }, []);

  useEffect(() => {
    // Skip auth check for login page
    if (pathname === "/admin/login") {
      setLoading(false);
      return;
    }

    // Check admin session from localStorage
    const raw = localStorage.getItem("admin_session");
    if (!raw) {
      router.replace("/admin/login");
      return;
    }

    (async () => {
    try {
      const session = JSON.parse(raw);
      const adminRoles = ["owner", "super_admin", "finance_admin", "support_admin"];
      if (!session?.role || !adminRoles.includes(session.role) || !session?.admin_id) {
        localStorage.removeItem("admin_session");
        router.replace("/admin/login");
        return;
      }

      // Check session expiry (8-hour max lifetime)
      // Sessions without expires_at are from before this check — force re-login
      if (!session.expires_at || Date.now() > session.expires_at) {
        localStorage.removeItem("admin_session");
        router.replace("/admin/login");
        return;
      }

      setEmail(session.name || "Admin");
      setUserRole(session.role);

      // Check admin status (restricted / suspended / terminated)
      try {
        const statusRes = await fetch("/api/admin/status", {
          headers: { "X-Admin-Id": session.admin_id },
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setAdminStatus(statusData.status);
          setRestrictedUntil(statusData.restricted_until ?? null);
          if (statusData.status === "suspended" || statusData.status === "terminated") {
            if (pathname !== "/admin/blocked") {
              router.replace("/admin/blocked");
              return;
            }
          }
        }
      } catch {}

      setLoading(false);
    } catch {
      localStorage.removeItem("admin_session");
      router.replace("/admin/login");
    }
    })();
  }, [pathname, router]);

  const adminLogout = () => {
    localStorage.removeItem("admin_session");
    router.replace("/admin/login");
  };

  // Heartbeat: ping availability API every 2 min to stay online
  useEffect(() => {
    if (pathname === "/admin/login") return;
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session?.admin_id) return;

    // Initial ping on mount
    fetch("/api/admin/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Id": session.admin_id },
      body: JSON.stringify({ heartbeat: true }),
    }).catch(() => {});

    const interval = setInterval(() => {
      fetch("/api/admin/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Id": session.admin_id },
        body: JSON.stringify({ heartbeat: true }),
      }).catch(() => {});
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [pathname]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
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
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session?.admin_id) return;

    const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
      headers: { "X-Admin-Id": session.admin_id },
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

  // Login and blocked pages render without admin chrome
  if (pathname === "/admin/login" || pathname === "/admin/blocked") {
    return <>{children}</>;
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

  const revenueRoles = ["owner", "super_admin"];

  const adminNavItems = [
    { label: "Overview", href: "/admin" },
    { label: "Users", href: "/admin/users" },
    { label: "Transactions", href: "/admin/transactions" },
    ...(userRole && revenueRoles.includes(userRole)
      ? [{ label: "Revenue", href: "/admin/revenue" }]
      : []),
    ...(userRole === "owner"
      ? [{ label: "Staff", href: "/admin/staff" }]
      : []),
  ];

  const moreNavItems = [
    { label: "Refunds", href: "/admin/refunds" },
    { label: "Approvals", href: "/admin/approvals" },
    { label: "Verifications", href: "/admin/verifications" },
    { label: "Disputes", href: "/admin/disputes" },
    { label: "Support", href: "/admin/support" },
    { label: "Tickets", href: "/admin/tickets" },
    { label: "Support Analytics", href: "/admin/support/analytics" },
    { label: "Overrides", href: "/admin/overrides" },
    { label: "Logs", href: "/admin/logs" },
    { label: "Activity", href: "/admin/activity" },
    { label: "Fraud", href: "/admin/fraud" },
    { label: "Guide", href: "/admin/guide" },
  ];

  const allNavItems = [...adminNavItems, ...moreNavItems];

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

            <div ref={moreMenuRef} className="relative flex items-center gap-2">
              <Link href="/admin" className="flex items-center gap-2">
                <span className={`${ui.h2} tracking-tight`}>ADMIN</span>
              </Link>

              <button
                onClick={() => setMoreMenuOpen((v) => !v)}
                className="text-white/60 hover:text-white text-lg px-2 py-1 transition flex-shrink-0"
                aria-label="More pages"
              >
                ☰
              </button>

              {moreMenuOpen && (
                <div className="absolute top-10 left-0 bg-black border border-white/10 rounded-xl shadow-lg p-2 w-48 z-50">
                  {moreNavItems.map((it) => {
                    const active = pathname === it.href || pathname?.startsWith(it.href);
                    return (
                      <button
                        key={it.href}
                        id={`nav-${it.href.split("/").pop()}`}
                        onClick={() => { router.push(it.href); setMoreMenuOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                          active ? "text-white bg-white/10" : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {adminNavItems.map((it) => (
                <Link key={it.href} id={`nav-${it.href.split("/").pop()}`} className={tabClass(it.href)} href={it.href}>
                  {it.label}
                </Link>
              ))}
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
            <AIAssistToggle />
            <Link href="/dashboard" className={ui.btnGhost}>
              ← Dashboard
            </Link>
            <button
              onClick={adminLogout}
              className={`${ui.btnGhost} text-red-400 hover:text-red-300`}
            >
              Log out
            </button>
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
              {allNavItems.map((it) => {
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
                <button
                  onClick={() => { setAdminDrawerOpen(false); adminLogout(); }}
                  className={`${ui.navIdle} w-full flex items-center gap-3 text-red-400`}
                >
                  <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                  Log out
                </button>
              </div>
            </nav>
          </aside>
        </div>
      )}

      <FraudAlertsBanner />

      {/* Restricted mode banner */}
      {adminStatus === "restricted" && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4">
          <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>
              Your account is in <strong>restricted mode</strong> — view-only access.
              {restrictedUntil && (
                <span className="ml-1 text-yellow-200/70">
                  Expires {new Date(restrictedUntil).toLocaleString()}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">{children}</main>

      {/* Global transfer notification modal */}
      <SupportTransferModal />
      <AIAssistPanel />
      <AdminAlertProvider />

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
