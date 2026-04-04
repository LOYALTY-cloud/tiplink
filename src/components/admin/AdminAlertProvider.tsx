"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AlertModal from "./AlertModal";

const PRIVILEGED_ROLES = ["owner", "super_admin", "finance_admin"];

export default function AdminAlertProvider() {
  const [alert, setAlert] = useState<{
    admin: string;
    targetUser: string;
    overrideType: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason: string;
    time: Date;
  } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("admin_session");
    if (!raw) return;

    let session: { role?: string; admin_id?: string };
    try {
      session = JSON.parse(raw);
    } catch {
      return;
    }

    if (!session?.role || !PRIVILEGED_ROLES.includes(session.role)) return;

    const channel = supabase
      .channel("admin-override-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_actions",
        },
        (payload) => {
          const data = payload.new as Record<string, unknown>;

          if (data.action !== "admin_override") return;
          if (data.severity !== "high") return;

          // Don't alert the admin who performed the override
          if (data.admin_id === session.admin_id) return;

          const meta = (data.metadata ?? {}) as Record<string, unknown>;

          try {
            new Audio("/sounds/notify.wav").play();
          } catch {}

          setAlert({
            admin: (meta.admin_name as string) ?? (data.admin_id as string) ?? "Unknown",
            targetUser: (meta.target_handle as string) ?? (data.target_user as string) ?? "Unknown",
            overrideType: (meta.override_type as string) ?? "unknown",
            before: (meta.previous as Record<string, unknown>) ?? {},
            after: (meta.applied as Record<string, unknown>) ?? {},
            reason: (meta.reason as string) ?? "",
            time: new Date((data.created_at as string) ?? Date.now()),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!alert) return null;

  return <AlertModal data={alert} onClose={() => setAlert(null)} />;
}
