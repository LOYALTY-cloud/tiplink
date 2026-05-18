"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function StoreMobileMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthed(Boolean(data.session?.user));
    })();
  }, []);

  async function logout() {
    for (const key of ["supabase.auth.token", "supabase.auth.token.0", "supabase.auth.token.1"]) {
      document.cookie = `${key}=; path=/; max-age=0; samesite=lax`;
    }
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
  }

  const links = [
    { href: "/mythemes", label: "My Themes" },
    { href: "/store", label: "Theme Store" },
    ...(authed ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(!authed ? [{ href: "/login", label: "Log In" }, { href: "/signup", label: "Sign Up" }] : []),
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/85"
        aria-label="Open menu"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] border-r border-white/10 bg-[#0b1220]/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.55)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-white/90">Navigation</p>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/8 text-white/80"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <nav className="space-y-1">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-white text-black"
                        : "text-white/75 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {authed && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <button
                  onClick={logout}
                  className="w-full rounded-xl bg-red-500/15 px-3 py-2 text-left text-sm text-red-300"
                >
                  Log out
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}