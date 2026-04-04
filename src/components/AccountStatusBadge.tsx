"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  active:           { label: "Active",     dot: "bg-green-400",  bg: "bg-green-500/10", text: "text-green-400" },
  restricted:       { label: "Restricted", dot: "bg-red-400",    bg: "bg-red-500/10",   text: "text-red-400" },
  suspended:        { label: "Suspended",  dot: "bg-red-400",    bg: "bg-red-500/10",   text: "text-red-400" },
  closed:           { label: "Closed",     dot: "bg-gray-400",   bg: "bg-gray-500/10",  text: "text-gray-400" },
  closed_finalized: { label: "Closed",     dot: "bg-gray-500",   bg: "bg-gray-500/10",  text: "text-gray-500" },
};

export default function AccountStatusBadge() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const userId = data.user.id;

      const { data: prof } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      setStatus(prof?.account_status ?? "active");

      // Real-time updates
      channel = supabase
        .channel(`status-badge-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as { account_status?: string };
            if (updated.account_status) setStatus(updated.account_status);
          }
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  if (!status || status === "active") return null;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
