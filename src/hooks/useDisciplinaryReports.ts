"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

export type PendingDisciplinaryReport = {
  id: string;
  notification_id: string;
  ticket_id: string | null;
  reason: string;
  title: string;
  severity: string;
  created_at: string;
  read_at: string | null;
  ticket_status: string | null;
};

export function useDisciplinaryReports() {
  const [reports, setReports] = useState<PendingDisciplinaryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/disciplinary/pending", {
        headers: getAdminHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setReports((json.reports ?? []) as PendingDisciplinaryReport[]);
    } catch {
      // Keep current state if request fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 20_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const session = getAdminSession();
    if (!session?.admin_id) return;

    const channel = supabase
      .channel(`admin-disciplinary-shared-${session.admin_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
          filter: `admin_id=eq.${session.admin_id}`,
        },
        () => {
          refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_notifications",
          filter: `admin_id=eq.${session.admin_id}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const acknowledge = useCallback(async (report: PendingDisciplinaryReport) => {
    if (!report.ticket_id) return false;
    if (busyId) return false;
    if (!report.read_at) return false;

    setBusyId(report.id);
    try {
      const res = await fetch("/api/admin/disciplinary/acknowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({
          ticketId: report.ticket_id,
          notificationId: report.notification_id,
        }),
      });

      if (!res.ok) return false;
      setReports((prev) => prev.filter((item) => item.id !== report.id));
      return true;
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const markAsRead = useCallback(async (report: PendingDisciplinaryReport) => {
    if (!report.ticket_id) return false;

    try {
      const res = await fetch("/api/admin/disciplinary/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ ticketId: report.ticket_id }),
      });

      if (!res.ok) return false;

      const nowIso = new Date().toISOString();
      setReports((prev) => prev.map((item) => (
        item.id === report.id ? { ...item, read_at: item.read_at ?? nowIso } : item
      )));
      return true;
    } catch {
      return false;
    }
  }, []);

  const locked = useMemo(() => reports.length > 0, [reports.length]);

  return {
    reports,
    loading,
    busyId,
    locked,
    refresh,
    markAsRead,
    acknowledge,
  };
}
