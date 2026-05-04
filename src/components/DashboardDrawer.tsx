"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Home,
  DollarSign,
  User,
  Share2,
  CreditCard,
  Wallet,
  Settings,
  HelpCircle,
  LogOut,
  X,
  UserCircle,
  Bell,
  Palette,
  Paintbrush,
  ShoppingBag,
} from "lucide-react";

interface Profile {
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  availability?: "online" | "busy" | "offline" | null;
  is_creator?: boolean | null;
}

export function DashboardDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadTx, setUnreadTx] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Prevent body scroll while drawer is open without causing layout shift.
  // NOTE: we do NOT modify body.overflow here because removing the scrollbar
  // causes a layout shift on the sticky header even with padding compensation.
  // Instead, globals.css uses `scrollbar-gutter: stable` which permanently
  // reserves the gutter space so the layout never shifts.
  useEffect(() => {
    if (!open) return;
    // Block wheel/touch scroll on the body while drawer is open
    const prevent = (e: Event) => {
      const target = e.target as Element;
      // Allow scrolling inside the drawer itself
      if (target.closest('[data-drawer-scroll]')) return;
      e.preventDefault();
    };
    document.addEventListener('wheel', prevent, { passive: false });
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      document.removeEventListener('wheel', prevent);
      document.removeEventListener('touchmove', prevent);
    };
  }, [open]);

  // Load real user data
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      setUserId(data.user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, display_name, avatar_url, availability, is_creator")
        .eq("user_id", data.user.id)
        .maybeSingle();
      setProfile(prof as Profile | null);

      // Update last_active_at
      await supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", data.user.id);

      // Fetch unread notifications count
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        try {
          const res = await fetch("/api/notifications", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            setUnreadCount(json.unread ?? 0);
          }
        } catch {
          // silent
        }
      }
    })();
  }, [open]);

  // Poll for is_creator updates every 30s — admin approval is a rare one-time event
  useEffect(() => {
    if (!userId) return;

    async function refreshIsCreator() {
      const { data } = await supabase
        .from("profiles")
        .select("is_creator")
        .eq("user_id", userId)
        .maybeSingle();
      if (data && typeof data.is_creator === "boolean") {
        setProfile((prev) => prev ? { ...prev, is_creator: data.is_creator as boolean } : prev);
      }
    }

    const interval = setInterval(refreshIsCreator, 30_000);
    return () => clearInterval(interval);
  }, [userId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    onClose();
    router.push("/login");
  }

  const displayName = profile?.display_name || (profile?.handle ? `@${profile.handle}` : email);
  const initial = profile?.handle?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? "?";
  // Treat signed-in users as active in the drawer even if availability is null.
  const isOnline = Boolean(userId);

  const sections = [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: Home },
        { label: "Profile", href: "/dashboard/profile", icon: User },
        { label: "Share", href: "/dashboard/share", icon: Share2 },
      ],
    },
    {
      title: "Financial",
      items: [
        { label: "Earnings", href: "/dashboard/earnings", icon: DollarSign },
        { label: "Wallet", href: "/dashboard/wallet", icon: Wallet },
        { label: "Transactions", href: "/dashboard/transactions", icon: CreditCard },
      ],
    },
    {
      title: "Creator",
      items: [
        ...(profile?.is_creator
          ? [{ label: "Theme Builder", href: "/dashboard/themebuilder", icon: Paintbrush }]
          : []),
        { label: "My Themes", href: "/dashboard/mythemes", icon: Palette },
      ],
    },
    {
      title: "Discover",
      items: [
        { label: "Theme Store", href: "/store", icon: ShoppingBag },
      ],
    },
    {
      title: "System",
      items: [
        { label: "Account", href: "/dashboard/account", icon: UserCircle },
        { label: "Settings", href: "/dashboard/settings", icon: Settings },
        { label: "Help & Support", href: "/dashboard/support", icon: HelpCircle },
      ],
    },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? "visible" : "invisible"}`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-label="Close menu"
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`absolute left-0 top-0 h-full w-[85%] max-w-sm bg-[#0B1220] border-r border-white/[0.12] flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top: header + profile */}
        <div className="flex-shrink-0 p-5 pb-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <img
              src="/1nelink-logo-clean.png"
              alt="1neLink"
              className="h-10 w-auto object-contain drop-shadow-[0_0_10px_rgba(0,224,255,0.4)]"
            />
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/5 border border-white/[0.12]">
            <div className="relative flex-shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 flex items-center justify-center text-black font-bold text-sm">
                  {initial}
                </div>
              )}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B1220] ${
                  isOnline ? "bg-green-400" : "bg-gray-500"
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-white/55">{profile?.is_creator ? "Creator" : "User"}</p>
            </div>
          </div>

          <div className="border-b border-white/[0.12] mb-2" />
        </div>

        {/* Scrollable Nav Items */}
        <nav className="flex-1 overflow-y-auto px-5 py-2 space-y-4" data-drawer-scroll>
          {sections.map((section) => {
            if (!section.items.length) return null;
            return (
              <div key={section.title}>
                <p className="text-[10px] uppercase text-white/30 mb-2 px-2">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((it) => {
                    const active =
                      it.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname?.startsWith(it.href);
                    const Icon = it.icon;
                    const hasNotif =
                      (it.label === "Transactions" && unreadTx) ||
                      (it.label === "Help & Support" && unreadCount > 0);
                    return (
                      <Link
                        key={it.label}
                        href={it.href}
                        onClick={onClose}
                        className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${
                          active
                            ? "bg-white/10 border border-white/[0.12] text-white font-medium"
                            : "text-white/55 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon size={18} />
                        {it.label}
                        {hasNotif && (
                          <span className="absolute right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Logout — always pinned at bottom */}
        <div className="flex-shrink-0 p-5 pt-3">
          <div className="border-t border-white/[0.12] mb-3" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition text-sm"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}
