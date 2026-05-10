"use client";

import { useEffect, useState } from "react";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";

type Status = "pending" | "approved" | "rejected";

type Application = {
  id: string;
  created_at: string;
  user_id: string;
  name: string | null;
  email: string | null;
  creator_type: string | null;
  experience: string | null;
  work: string | null;
  portfolio: string | null;
  intent: string | null;
  status: Status;
};

type Counts = {
  pending: number;
  approved: number;
  rejected: number;
};

export default function AdminCreatorsPage() {
  const emptyCounts: Counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  const [apps, setApps] = useState<Application[]>([]);
  const [status, setStatus] = useState<Status>("pending");
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      window.location.href = "/admin/login";
      return;
    }
    fetchApps(status);
  }, [status]);

  const fetchApps = async (currentStatus: Status) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/creators/applications?status=${currentStatus}`,
        { headers: getAdminHeaders(), cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load applications");

      setApps(json.applications ?? []);
      setCounts(json.counts ?? emptyCounts);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, nextStatus: "approved" | "rejected") => {
    setBusyId(id);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/creators/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ id, status: nextStatus }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update application");

      await fetchApps(status);
      setActionMessage(
        nextStatus === "approved"
          ? "Application approved. Approval email queued."
          : "Application rejected. Rejection email queued."
      );
    } catch (e) {
      console.error(e);
      setActionError(e instanceof Error ? e.message : "Failed to update application");
    } finally {
      setBusyId(null);
    }
  };

  const tabs = [
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  return (
    <div className="min-h-screen bg-black text-white px-6 py-8">

      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Elite Creator Applications
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Review and manage elite creator access
        </p>
        <div className="mt-3">
          <a
            href="/admin/creators/onboarding-report"
            className="inline-flex items-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/20 transition"
          >
            View onboarding category report
          </a>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-3 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key as Status)}
            className={`px-4 py-2 rounded-xl text-sm transition ${
              status === tab.key
                ? "bg-white text-black"
                : "bg-white/10 hover:bg-white/20 text-white/70"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs opacity-70">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {actionMessage ? (
        <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      ) : null}

      {/* CONTENT */}
      {loading ? (
        <div className="text-white/40">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="text-white/30">No elite creator applications</div>
      ) : (
        <div className="grid gap-5">
          {apps.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl p-5 bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/10 backdrop-blur"
            >
              {/* TOP */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-semibold text-lg">
                    {app.name ?? "Unnamed"}
                  </h2>
                  <p className="text-sm text-white/50">
                    {app.email ?? "No email"}
                  </p>
                </div>

                <span
                  className={`text-xs px-3 py-1 rounded-full ${
                    app.status === "approved"
                      ? "bg-green-500/20 text-green-400"
                      : app.status === "rejected"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {app.status}
                </span>
              </div>

              {/* DETAILS */}
              <div className="space-y-2 text-sm text-white/70">
                <p><span className="text-white/40">Type:</span> {app.creator_type ?? "—"}</p>
                <p><span className="text-white/40">Experience:</span> {app.experience ?? "—"}</p>
                {app.portfolio && (
                  <p className="break-all">
                    <span className="text-white/40">Portfolio:</span> {app.portfolio}
                  </p>
                )}
              </div>

              {/* INTENT */}
              {app.intent && (
                <div className="mt-4 p-3 rounded-xl bg-white/5 text-sm text-white/60 whitespace-pre-wrap">
                  {app.intent}
                </div>
              )}

              {/* ACTIONS */}
              {app.status === "pending" && (
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => updateStatus(app.id, "approved")}
                    disabled={busyId === app.id}
                    className="flex-1 py-2 rounded-xl bg-green-500 text-black font-semibold hover:bg-green-400 transition disabled:opacity-50"
                  >
                    Approve
                  </button>

                  <button
                    onClick={() => updateStatus(app.id, "rejected")}
                    disabled={busyId === app.id}
                    className="flex-1 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-400 transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}