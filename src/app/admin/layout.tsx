"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { ui } from "@/lib/ui";
import SupportTransferModal from "@/components/admin/SupportTransferModal";
import { useAdminLock } from "@/hooks/useAdminLock";
import AdminLockScreen from "@/components/admin/AdminLockScreen";
import SessionWarningModal from "@/components/SessionWarningModal";
import AIAssistToggle from "@/components/admin/AIAssistToggle";
import { clearAdminSession, getAdminHeaders } from "@/lib/auth/adminSession";
import FraudAlertsBanner from "@/components/admin/FraudAlertsBanner";
import AdminAlertProvider from "@/components/admin/AdminAlertProvider";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import AdminDisciplinaryAlertBanner from "@/components/admin/AdminDisciplinaryAlertBanner";
import DisciplinaryModal from "@/components/admin/DisciplinaryModal";
import { useDisciplinaryReports } from "@/hooks/useDisciplinaryReports";
import NotificationBell from "@/components/admin/NotificationBell";

type SearchResult = {
  type: "user" | "transaction" | "tip";
  label: string;
  sub: string;
  href: string;
};

type NavItem = { label: string; href: string; icon: string };
type NavSection = { title: string; items: NavItem[] };

/**
 * MoreMenuPanel — isolated component so its open/close state never
 * causes the parent AdminLayout to re-render (eliminates menu-open jitter).
 */
const MoreMenuPanel = memo(function MoreMenuPanel({
  sections,
}: {
  sections: NavSection[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wait for hydration before portalling into document.body
  useEffect(() => { setMounted(true); }, []);

  // Native wheel block — prevents page scroll while the panel is open.
  // React onWheel+stopPropagation doesn't work because the browser's native
  // scroll handling fires before React's synthetic event system.
  useEffect(() => {
    if (!open) return;
    const panel = scrollRef.current;
    const blockScroll = (e: WheelEvent) => {
      if (panel && panel.contains(e.target as Node)) {
        const { scrollTop, scrollHeight, clientHeight } = panel;
        if (scrollTop === 0 && e.deltaY < 0) e.preventDefault();
        if (scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0) e.preventDefault();
      } else {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", blockScroll, { passive: false });
    return () => document.removeEventListener("wheel", blockScroll);
  }, [open]);

  // backdrop-filter on the sticky header creates a new containing block,
  // trapping position:fixed children inside it (known CSS quirk).
  // createPortal renders the panel directly into document.body so it
  // escapes the header's stacking context entirely.
  const panel = (
    <div
      className="fixed inset-0 z-[199] pointer-events-none"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      {/* Slide panel */}
      <aside
        className={`absolute left-0 top-0 h-full w-64 bg-[#0B1220] border-r border-white/10 shadow-[4px_0_40px_rgba(0,0,0,0.7)] flex flex-col pointer-events-auto transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Admin</p>
            <p className="text-sm font-semibold">More Pages</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
            aria-label="Close"
          >✕</button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] text-white/30 uppercase tracking-wider px-3 mb-1">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((it) => {
                  const active = pathname === it.href || (it.href !== "/admin" && pathname?.startsWith(it.href));
                  return (
                    <button
                      key={it.href}
                      onClick={() => { router.push(it.href); setOpen(false); }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${active ? "bg-blue-500/20 text-blue-400 border border-blue-400/20" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                    >
                      <span className="text-base">{it.icon}</span>
                      <span>{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      {/* Hamburger trigger — stays inside the header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="hidden md:block text-white/60 hover:text-white text-lg px-2 py-1 flex-shrink-0"
        aria-label="More pages"
      >
        ☰
      </button>

      {/* Panel portalled into document.body — escapes backdrop-filter stacking context */}
      {mounted && createPortal(panel, document.body)}
    </>
  );
});

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
  const [sessionWarning, setSessionWarning] = useState(false);
  const disciplinary = useDisciplinaryReports();
  const searchRef = useRef<HTMLDivElement>(null);
  const drawerScrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Tracks last real interaction (keydown/mousedown/scroll/touch).
  // mousemove is intentionally excluded — only purposeful actions count as work.
  const lastMeaningfulActivityRef = useRef<number>(Date.now());

  // Admin: lock after 5 min idle or tab switch; hard-logout at 60 min
  const lockEnabled = !loading && pathname !== "/admin/login" && pathname !== "/admin/blocked";
  const { isLocked, lockReason, unlock, resetActivity } = useAdminLock(lockEnabled);

  useEffect(() => {
    const onWarning = () => setSessionWarning(true);
    window.addEventListener("session_warning", onWarning);
    return () => window.removeEventListener("session_warning", onWarning);
  }, []);

  // Dismiss the warning modal the moment the lock screen activates so it
  // doesn't re-appear immediately after the admin unlocks.
  useEffect(() => {
    if (isLocked) setSessionWarning(false);
  }, [isLocked]);

  useEffect(() => {
    // Skip auth check for login page
    if (pathname === "/admin/login") {
      setLoading(false);
      return;
    }

    // Check admin session from localStorage
    const raw = localStorage.getItem("admin_session");
    const token = localStorage.getItem("admin_token");
    if (!raw || !token) {
      clearAdminSession();
      router.replace("/admin/login");
      return;
    }

    (async () => {
    try {
      const session = JSON.parse(raw);
      const adminRoles = ["owner", "co_owner", "super_admin", "security", "finance_admin", "support_admin", "compliance", "moderator", "analyst"];
      if (!session?.role || !adminRoles.includes(session.role) || !session?.admin_id) {
        clearAdminSession();
        router.replace("/admin/login");
        return;
      }

      // Check session expiry (8-hour max lifetime)
      // Sessions without expires_at are from before this check — force re-login
      if (!session.expires_at || Date.now() > session.expires_at) {
        clearAdminSession();
        router.replace("/admin/login");
        return;
      }

      setEmail(session.name || "Admin");
      setUserRole(session.role);

      // Check admin status (restricted / suspended / terminated)
      try {
        const statusRes = await fetch("/api/admin/status", {
          headers: getAdminHeaders(),
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
      clearAdminSession();
      router.replace("/admin/login");
    }
    })();
  }, [pathname, router]);

  const adminLogout = () => {
    const raw = localStorage.getItem("admin_session");
    if (raw) {
      try {
        const session = JSON.parse(raw);
        if (session?.admin_id) {
          navigator.sendBeacon(
            "/api/admin/availability",
            new Blob([JSON.stringify({ availability: "offline", _admin_id: session.admin_id })], { type: "application/json" })
          );
          // End work session for payroll tracking
          navigator.sendBeacon(
            "/api/admin/session/end",
            new Blob([JSON.stringify({ admin_id: session.id })], { type: "application/json" })
          );
        }
      } catch {}
    }
    clearAdminSession();
    router.replace("/admin/login");
  };

  // Record last real interaction so the heartbeat can gate on actual work.
  // mousemove is excluded — only intentional input counts toward payroll time.
  useEffect(() => {
    const track = () => { lastMeaningfulActivityRef.current = Date.now(); };
    window.addEventListener("keydown", track, { passive: true });
    window.addEventListener("mousedown", track, { passive: true });
    window.addEventListener("scroll", track, { passive: true, capture: true });
    window.addEventListener("touchstart", track, { passive: true });
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("mousedown", track);
      window.removeEventListener("scroll", track, { capture: true });
      window.removeEventListener("touchstart", track);
    };
  }, []);

  // Heartbeat: ping presence API every 20s to stay online (production-grade)
  // Intentionally no pathname dependency — one interval for the layout lifetime.
  useEffect(() => {
    if (pathname === "/admin/login") return;
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session?.admin_id) return;
    // Don't heartbeat with an expired session — let the auth check redirect to login
    if (!session.expires_at || Date.now() > session.expires_at) return;

    // Initial ping on mount (only if tab is visible)
    if (document.visibilityState === "visible") {
      fetch("/api/admin/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      }).catch(() => {});
    }

    const interval = setInterval(() => {
      // Multi-tab fix: only send heartbeat when tab is visible
      if (document.visibilityState !== "visible") return;
      // Payroll accuracy: only count time when admin has done something real in
      // the last 30s. Sitting idle or wiggling the mouse does NOT count.
      const idleMs = Date.now() - lastMeaningfulActivityRef.current;
      if (idleMs > 30_000) return;
      fetch("/api/admin/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
      }).catch(() => {});
    }, 20_000); // every 20 seconds

    return () => clearInterval(interval);
  }, []);

  // Mark offline on tab close / hide
  useEffect(() => {
    if (pathname === "/admin/login") return;
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;
    let adminId: string | null = null;
    let userId: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      adminId = parsed?.admin_id;
      userId = parsed?.id;
    } catch {}
    if (!adminId) return;

    function sendOffline() {
      if (!adminId) return;
      navigator.sendBeacon(
        "/api/admin/availability",
        new Blob([JSON.stringify({ availability: "offline", _admin_id: adminId })], { type: "application/json" })
      );
    }

    function endWorkSession() {
      if (!userId) return;
      navigator.sendBeacon(
        "/api/admin/session/end",
        new Blob([JSON.stringify({ admin_id: userId })], { type: "application/json" })
      );
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") sendOffline();
      else {
        // Tab re-focused → reset activity clock and presence ping.
        // Don't count idle time accumulated while the tab was in the background.
        lastMeaningfulActivityRef.current = Date.now();
        fetch("/api/admin/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        }).catch(() => {});
      }
    }

    function handleBeforeUnload() {
      sendOffline();
      endWorkSession();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

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

  // Prevent scroll-chaining into the page while the MOBILE drawer is open.
  // overflow:hidden (not position:fixed) preserves scroll position automatically —
  // no need for window.scrollTo hack which causes a visible scroll jump.
  useEffect(() => {
    if (!adminDrawerOpen) return;

    const body = document.body;
    const prevOverflow = body.style.overflow;

    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [adminDrawerOpen]);

  useEffect(() => {
    const drawer = drawerScrollRef.current;
    if (!drawer || !adminDrawerOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const { scrollTop, scrollHeight, clientHeight } = drawer;
      const atTop = scrollTop === 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    };
    drawer.addEventListener("wheel", onWheel, { passive: false });
    return () => drawer.removeEventListener("wheel", onWheel);
  }, [adminDrawerOpen]);

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
    const headers = getAdminHeaders();
    if (!Object.keys(headers).length) return;

    const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
      headers,
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

  // useMemo MUST be before any conditional return (Rules of Hooks).
  // Inline the non-Core sections so no hook is skipped on early returns.
  const moreSections = useMemo<NavSection[]>(() => [
    {
      title: "Core Dashboard",
      items: [
        { label: "Overview", href: "/admin", icon: "🏠" },
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [
              { label: "Activity", href: "/admin/activity", icon: "📋" },
              { label: "Activity Calendar", href: "/admin/activity-calendar", icon: "🗓️" },
            ]
          : []),
      ],
    },
    {
      title: "User Management",
      items: [
        { label: "Users", href: "/admin/users", icon: "👤" },
        { label: "Verifications", href: "/admin/verifications", icon: "🔍" },
        ...(userRole && ["owner", "super_admin", "finance_admin"].includes(userRole)
          ? [{ label: "Fraud", href: "/admin/fraud", icon: "🚨" }]
          : []),
        ...(userRole && ["owner", "super_admin", "finance_admin"].includes(userRole)
          ? [{ label: "Overrides", href: "/admin/overrides", icon: "⚙️" }]
          : []),
      ],
    },
    {
      title: "Creator / Store",
      items: [
        { label: "Creator Applications", href: "/admin/creator-applications", icon: "🎨" },
        { label: "Elite Applications", href: "/admin/creators", icon: "⭐" },
        { label: "Theme Store Queue", href: "/admin/marketplace", icon: "🛒" },
        { label: "Theme Appeals", href: "/admin/marketplace/appeals", icon: "📬" },
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [{ label: "Store Hero Ads", href: "/admin/store-hero", icon: "🎬" }]
          : []),
      ],
    },
    {
      title: "Finance",
      items: [
        { label: "Transactions", href: "/admin/transactions", icon: "💳" },
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [{ label: "Revenue", href: "/admin/revenue", icon: "💰" }]
          : []),
        { label: "Refunds", href: "/admin/refunds", icon: "💸" },
        { label: "Disputes", href: "/admin/disputes", icon: "⚠️" },
        { label: "Approvals", href: "/admin/approvals", icon: "✅" },
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [{ label: "Payroll", href: "/admin/payroll", icon: "💰" }]
          : []),
        ...(userRole && ["owner", "co_owner"].includes(userRole)
          ? [{ label: "Stripe Activity", href: "/admin/stripe", icon: "⚡" }]
          : []),
      ],
    },
    {
      title: "Support",
      items: [
        { label: "Tickets", href: "/admin/tickets", icon: "🎫" },
        { label: "Live Chat", href: "/admin/support", icon: "💬" },
        { label: "Analytics", href: "/admin/support/analytics", icon: "📊" },
        { label: "Reports", href: "/admin/reports", icon: "🚩" },
        { label: "Notifications", href: "/admin/notifications", icon: "🔔" },
        ...(userRole && ["owner", "co_owner", "super_admin", "compliance", "support_admin"].includes(userRole)
          ? [{ label: "DMCA", href: "/admin/dmca", icon: "⚖️" }]
          : []),
        ...(userRole && ["owner", "co_owner", "super_admin", "compliance", "moderator", "support_admin"].includes(userRole)
          ? [{ label: "Strikes", href: "/admin/strikes", icon: "⚡" }]
          : []),
      ],
    },
    ...(userRole && ["owner", "co_owner", "super_admin"].includes(userRole)
      ? [{
          title: "Staff / HR",
          items: [
            { label: "Staff", href: "/admin/staff", icon: "🛡️" },
            { label: "Discipline", href: "/admin/staff/tickets", icon: "🧾" },
            { label: "Applicants", href: "/admin/applicants", icon: "📝" },
            { label: "Interviews", href: "/admin/interviews", icon: "📅" },
          ],
        }]
      : []),
    {
      title: "Tools",
      items: [
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [{ label: "Security", href: "/admin/security", icon: "🔒" }]
          : []),
        ...(userRole && ["owner", "super_admin"].includes(userRole)
          ? [{ label: "Logs", href: "/admin/logs", icon: "📜" }]
          : []),
        ...(userRole && ["owner"].includes(userRole)
          ? [{ label: "Owner AI", href: "/admin/owner-ai", icon: "🧠" }]
          : []),
        { label: "Guide", href: "/admin/guide", icon: "📖" },
      ],
    },
  ], [userRole]);

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

  const revenueRoles = ["owner", "co_owner", "super_admin", "analyst"];
  const staffRoles = ["owner", "co_owner", "super_admin"];
  const payrollRoles = ["owner", "super_admin"];
  const fraudRoles = ["owner", "co_owner", "super_admin", "finance_admin", "security", "compliance"];
  const overrideRoles = ["owner", "co_owner", "super_admin", "finance_admin"];
  const logRoles = ["owner", "co_owner", "super_admin", "security"];
  const activityRoles = ["owner", "co_owner", "super_admin", "security"];
  const storeHeroRoles = ["owner", "co_owner", "super_admin"];
  const ownerOnlyRoles = ["owner"];
  const dmcaRoles = ["owner", "co_owner", "super_admin", "compliance", "support_admin"];

  const NAV_SECTIONS = [
    {
      title: "Core Dashboard",
      items: [
        { label: "Overview", href: "/admin", icon: "🏠" },
        { label: "Users", href: "/admin/users", icon: "👤" },
        { label: "Transactions", href: "/admin/transactions", icon: "💳" },
        ...(userRole && revenueRoles.includes(userRole)
          ? [{ label: "Revenue", href: "/admin/revenue", icon: "💰" }]
          : []),
      ],
    },
    {
      title: "User Management",
      items: [
        { label: "Verifications", href: "/admin/verifications", icon: "🔍" },
        ...(userRole && fraudRoles.includes(userRole)
          ? [{ label: "Fraud", href: "/admin/fraud", icon: "🚨" }]
          : []),
        ...(userRole && overrideRoles.includes(userRole)
          ? [{ label: "Overrides", href: "/admin/overrides", icon: "⚙️" }]
          : []),
      ],
    },
    {
      title: "Creator / Store",
      items: [
        { label: "Creator Applications", href: "/admin/creator-applications", icon: "🎨" },
        { label: "Elite Applications", href: "/admin/creators", icon: "⭐" },
        { label: "Theme Store Queue", href: "/admin/marketplace", icon: "🛒" },
        { label: "Theme Appeals", href: "/admin/marketplace/appeals", icon: "📬" },
        ...(userRole && storeHeroRoles.includes(userRole)
          ? [{ label: "Store Hero Ads", href: "/admin/store-hero", icon: "🎬" }]
          : []),
      ],
    },
    {
      title: "Finance",
      items: [
        { label: "Refunds", href: "/admin/refunds", icon: "💸" },
        { label: "Disputes", href: "/admin/disputes", icon: "⚠️" },
        { label: "Approvals", href: "/admin/approvals", icon: "✅" },
        ...(userRole && payrollRoles.includes(userRole)
          ? [{ label: "Payroll", href: "/admin/payroll", icon: "💰" }]
          : []),
        ...(userRole && ["owner", "co_owner"].includes(userRole)
          ? [{ label: "Stripe Activity", href: "/admin/stripe", icon: "⚡" }]
          : []),
      ],
    },
    {
      title: "Support",
      items: [
        { label: "Tickets", href: "/admin/tickets", icon: "🎫" },
        { label: "Live Chat", href: "/admin/support", icon: "💬" },
        { label: "Analytics", href: "/admin/support/analytics", icon: "📊" },
        { label: "Reports", href: "/admin/reports", icon: "🚩" },
        { label: "Notifications", href: "/admin/notifications", icon: "🔔" },
        ...(userRole && dmcaRoles.includes(userRole)
          ? [{ label: "DMCA", href: "/admin/dmca", icon: "⚖️" }]
          : []),
        ...(userRole && ["owner", "co_owner", "super_admin", "compliance", "moderator", "support_admin"].includes(userRole)
          ? [{ label: "Strikes", href: "/admin/strikes", icon: "⚡" }]
          : []),
      ],
    },
    ...(userRole && staffRoles.includes(userRole)
      ? [{
          title: "Staff / HR",
          items: [
            { label: "Staff", href: "/admin/staff", icon: "🛡️" },
            { label: "Discipline", href: "/admin/staff/tickets", icon: "🧾" },
            { label: "Applicants", href: "/admin/applicants", icon: "📝" },
            { label: "Interviews", href: "/admin/interviews", icon: "📅" },
          ],
        }]
      : []),
    {
      title: "Tools",
      items: [
        ...(userRole && logRoles.includes(userRole)
          ? [{ label: "Security", href: "/admin/security", icon: "🔒" }]
          : []),
        ...(userRole && activityRoles.includes(userRole)
          ? [
              { label: "Activity", href: "/admin/activity", icon: "📋" },
              { label: "Activity Calendar", href: "/admin/activity-calendar", icon: "🗓️" },
            ]
          : []),
        ...(userRole && logRoles.includes(userRole)
          ? [{ label: "Logs", href: "/admin/logs", icon: "📜" }]
          : []),
        ...(userRole && ownerOnlyRoles.includes(userRole)
          ? [{ label: "Owner AI", href: "/admin/owner-ai", icon: "🧠" }]
          : []),
        { label: "Guide", href: "/admin/guide", icon: "📖" },
      ],
    },
  ];

  const adminNavItems = NAV_SECTIONS[0].items;

  // Render lock screen over everything when locked
  if (isLocked) {
    return (
      <AdminLockScreen
        lockReason={lockReason}
        onUnlock={async (passcode) => {
          const result = await unlock(passcode);
          if (result.ok) setSessionWarning(false);
          return result;
        }}
        adminName={email || undefined}
        adminRole={userRole || undefined}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-black/60 backdrop-blur-xl border-b border-white/10 [will-change:transform]">
        <div className="max-w-7xl mx-auto px-3 md:px-8 h-12 md:h-auto md:py-3 flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setAdminDrawerOpen(true)}
              className="md:hidden text-white/60 hover:text-white text-lg px-2 py-1 transition"
              aria-label="Open menu"
            >
              ☰
            </button>

            <div className="flex items-center gap-2">
              <Link href="/admin" className="flex items-center gap-2">
                <span className="text-sm md:text-lg font-semibold tracking-wide">ADMIN</span>
              </Link>

              <MoreMenuPanel sections={moreSections} />
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {adminNavItems.map((it) => (
                <Link key={it.href} id={`nav-${it.href.split("/").pop()}`} className={tabClass(it.href)} href={it.href}>
                  {it.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
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
            <NotificationBell />
            <AIAssistToggle />
            <button
              onClick={adminLogout}
              className={`${ui.btnGhost} text-red-400 hover:text-red-300 hidden md:inline-flex text-xs md:text-sm`}
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
            className="absolute inset-0 bg-black/60"
            onClick={() => setAdminDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] bg-[#0B1220] border-r border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col transform transition-transform duration-300 translate-x-0">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Admin</p>
                <p className="text-sm font-semibold">Navigation</p>
              </div>
              <button
                onClick={() => setAdminDrawerOpen(false)}
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Grouped nav sections */}
            <div
              ref={drawerScrollRef}
              className="menu-scroll-stable flex-1 overflow-y-auto overscroll-contain px-2 py-3 space-y-4"
              onTouchMove={(e) => e.stopPropagation()}
            >
              {NAV_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider px-3 mb-1">
                    {section.title}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setAdminDrawerOpen(false)}
                          className={`admin-menu-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                            active
                              ? "bg-blue-500/20 text-blue-400 border border-blue-400/20"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span className="text-base">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom actions */}
            <div className="border-t border-white/10 p-3 space-y-1">
              <button
                onClick={() => { setAdminDrawerOpen(false); adminLogout(); }}
                className="admin-menu-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full"
              >
                <span className="text-base">⏻</span>
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className={disciplinary.locked ? "pointer-events-none blur-[1.5px] select-none" : ""}>
        <FraudAlertsBanner />
        <AdminDisciplinaryAlertBanner
          alerts={disciplinary.reports}
          loading={disciplinary.loading}
          busyId={disciplinary.busyId}
          acknowledge={disciplinary.acknowledge}
        />

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

        <main className="max-w-7xl mx-auto px-3 md:px-8 py-4 md:py-6">{children}</main>

        {/* Global transfer notification modal */}
        <SupportTransferModal />
        <AIAssistPanel />
        <AdminAlertProvider />
      </div>

      <DisciplinaryModal
        reports={disciplinary.reports}
        loading={disciplinary.loading}
        busyId={disciplinary.busyId}
        markAsRead={disciplinary.markAsRead}
        acknowledge={disciplinary.acknowledge}
      />

      <SessionWarningModal
        open={sessionWarning}
        onStay={() => {
          setSessionWarning(false);
          resetActivity(); // directly reset idle timers — no synthetic event needed
        }}
      />
    </div>
  );
}
