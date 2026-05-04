"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { supabase } from "@/lib/supabase/client";
import { isSupportFileRef } from "@/lib/supportFiles";

type Mode = "admin" | "user";

export function useResolvedSupportFiles(refs: Array<string | null | undefined>, mode: Mode) {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const targets = useMemo(
    () => [...new Set(refs.filter((ref): ref is string => isSupportFileRef(ref)))],
    [refs],
  );

  useEffect(() => {
    const missing = targets.filter((ref) => !resolved[ref]);
    if (missing.length === 0) return;

    let cancelled = false;

    async function load() {
      let headers: Record<string, string> = {};
      if (mode === "admin") {
        headers = getAdminHeaders();
      } else {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        headers = { Authorization: `Bearer ${token}` };
      }

      const pairs = await Promise.all(
        missing.map(async (ref) => {
          const res = await fetch(`/api/support/files/url?ref=${encodeURIComponent(ref)}`, { headers });
          if (!res.ok) return null;
          const json = await res.json();
          return json.url ? [ref, json.url] as const : null;
        }),
      );

      if (cancelled) return;

      const next = Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => !!pair));
      if (Object.keys(next).length > 0) {
        setResolved((prev) => ({ ...prev, ...next }));
      }
    }

    load().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mode, resolved, targets]);

  return resolved;
}

export function getResolvedSupportFileUrl(fileUrl: string | null | undefined, resolved: Record<string, string>): string | null {
  if (!fileUrl) return null;
  if (!isSupportFileRef(fileUrl)) return fileUrl;
  return resolved[fileUrl] ?? null;
}