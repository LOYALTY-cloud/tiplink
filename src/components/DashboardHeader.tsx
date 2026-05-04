"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const mainTabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/share", label: "Share" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/wallet", label: "Wallet" },
];

const accountTabs = [
  { href: "/store", label: "Theme Store" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/support", label: "Support" },
];

export default function DashboardHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Helper: highlight active tab
  const isActive = (href: string) => pathname === href;

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12] relative">
      <div className="flex items-center gap-3">
        <img
          src="/1nelink-logo.png"
          alt="1neLink"
          className="h-9 md:h-11 w-auto object-contain drop-shadow-[0_0_10px_rgba(0,224,255,0.4)] transition-opacity hover:opacity-90"
        />
      </div>

      {/* Desktop Tabs */}
      <nav className="hidden md:flex gap-6 text-sm">
        {mainTabs.map(tab => (
          <a
            key={tab.href}
            href={tab.href}
            className={
              isActive(tab.href)
                ? "text-blue-400 font-medium"
                : "text-white/80 hover:text-blue-300 transition"
            }
          >
            {tab.label}
          </a>
        ))}
      </nav>

      {/* Hamburger */}
      <button
        className="p-2 md:hidden text-xl"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>
      <button
        className="p-2 hidden md:block text-xl"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Desktop Hamburger Menu (Account Only) */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-4 top-16 w-52 bg-black border border-white/[0.12] rounded-xl p-3 z-50">
            {accountTabs.map(tab => (
              <a key={tab.href} href={tab.href} onClick={() => setMenuOpen(false)} className="block py-2 px-2 text-white/80 hover:text-blue-300 transition">
                {tab.label}
              </a>
            ))}
            <div className="border-t border-white/[0.12] my-2" />
            <button className="block py-2 px-2 text-red-400 w-full text-left">Log out</button>
          </div>
        </>
      )}

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/90 p-6 md:hidden z-50">
          <div className="flex justify-end">
            <button onClick={() => setMenuOpen(false)} className="text-2xl">✕</button>
          </div>
          <nav className="mt-6 flex flex-col gap-4 text-lg">
            {mainTabs.map(tab => (
              <a
                key={tab.href}
                href={tab.href}
                className={
                  isActive(tab.href)
                    ? "text-blue-400 font-medium"
                    : "text-white/80 hover:text-blue-300 transition"
                }
              >
                {tab.label}
              </a>
            ))}
            <div className="border-t border-white/[0.12] my-4"></div>
            {accountTabs.map(tab => (
              <a key={tab.href} href={tab.href} className="block py-2 text-white/80 hover:text-blue-300 transition">
                {tab.label}
              </a>
            ))}
            <div className="border-t border-white/[0.12] my-4"></div>
            <button className="text-red-400 text-left">Log out</button>
          </nav>
        </div>
      )}
    </header>
  );
}
