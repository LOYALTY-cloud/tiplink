"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";
import { effectiveRiskLevel } from "@/lib/fraudExplain";
import CaseTimeline, { type TimelineEvent } from "./CaseTimeline";
import EvidencePanel from "./EvidencePanel";
import ChainView from "./ChainView";

type FrozenProfile = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  email: string | null;
  trust_score: number | null;
  risk_level: string | null;
  is_frozen: boolean;
  freeze_reason: string | null;
  frozen_at: string | null;
  account_status: string | null;
  is_flagged: boolean;
  created_at: string;
};

export default function FraudCases() {
  const [cases, setCases] = useState<FrozenProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unfreezing, setUnfreezing] = useState<string | null>(null);
  const [tempUnfreezing, setTempUnfreezing] = useState<string | null>(null);
  const [tempHours, setTempHours] = useState<number>(4);
  const [error, setError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from("profiles")
      .select(
        "user_id, handle, display_name, email, trust_score, risk_level, is_frozen, freeze_reason, frozen_at, account_status, is_flagged, created_at"
      )
      .eq("is_frozen", true)
      .order("frozen_at", { ascending: false });

    if (dbErr) {
      setError(dbErr.message);
    } else {
      setCases(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  async function handleUnfreeze(userId: string) {
    setUnfreezing(userId);
    setError(null);
    try {
      const headers = getAdminHeaders();
      const res = await fetch("/api/admin/unfreeze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ user_id: userId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Unfreeze failed");
      } else {
        setCases((prev) => prev.filter((c) => c.user_id !== userId));
        if (selectedId === userId) setSelectedId(null);
      }
    } catch {
      setError("Network error");
    }
    setUnfreezing(null);
  }

  async function handleTempUnfreeze(userId: string) {
    setTempUnfreezing(userId);
    setError(null);
    try {
      const headers = getAdminHeaders();
      const res = await fetch("/api/admin/temp-unfreeze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ user_id: userId, hours: tempHours }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Temp unfreeze failed");
      } else {
        const exp = new Date(body.expires_at).toLocaleTimeString();
        setError(null);
        // Show inline confirmation by briefly flashing the error area as success
        setCases((prev) =>
          prev.map((c) =>
            c.user_id === userId
              ? { ...c, freeze_reason: `[Temp window open until ${exp}] ${c.freeze_reason ?? ""}` }
              : c
          )
        );
      }
    } catch {
      setError("Network error");
    }
    setTempUnfreezing(null);
  }

  const selected = cases.find((c) => c.user_id === selectedId);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className={`${ui.h2} text-lg`}>
              Frozen Accounts{" "}
              <span className="text-white/55 text-sm font-normal">({cases.length})</span>
            </h2>
            <button onClick={fetchCases} className={`${ui.btnGhost} ${ui.btnSmall}`}>
              Refresh
            </button>
          </div>

          {loading ? (
            <p className={ui.muted}>Loading cases…</p>
          ) : cases.length === 0 ? (
            <div className={`${ui.card} ${ui.cardInner} p-8 text-center`}>
              <p className={ui.muted}>No frozen accounts.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((c) => (
                <button
                  key={c.user_id}
                  onClick={() => { setSelectedId(c.user_id); setTimelineEvents([]); }}
                  className={`w-full text-left rounded-xl p-4 transition border ${
                    selectedId === c.user_id
                      ? "bg-white/10 border-blue-400/30"
                      : "bg-white/5 border-white/[0.12] hover:bg-white/8 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">
                        {c.handle ? `@${c.handle}` : c.display_name ?? c.user_id.slice(0, 8) + "…"}
                      </p>
                      <p className="text-white/55 text-xs mt-0.5">{c.email ?? "No email"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 text-xs font-medium">🔒 Frozen</p>
                      {c.frozen_at && (
                        <p className="text-white/45 text-xs mt-0.5">
                          {new Date(c.frozen_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-white/50 text-xs mt-2 truncate">
                    Reason: {c.freeze_reason ?? "Unknown"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Investigation Panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-4">
              {/* Case Header */}
              <div className={`${ui.card} ${ui.cardInner} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-lg">
                    {selected.handle ? `@${selected.handle}` : selected.display_name ?? "User"}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${
                      (selected.trust_score ?? 50) < 30 ? "text-red-400" :
                      (selected.trust_score ?? 50) < 60 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {selected.trust_score ?? "–"}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      effectiveRiskLevel(selected.risk_level ?? "low", selected) === "high" ? "text-red-400 bg-red-500/10" :
                      effectiveRiskLevel(selected.risk_level ?? "low", selected) === "medium" ? "text-yellow-400 bg-yellow-500/10" :
                      "text-green-400 bg-green-500/10"
                    }`}>
                      {effectiveRiskLevel(selected.risk_level ?? "low", selected)} risk
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-white/55 text-xs">User ID</span>
                    <Link
                      href={`/admin/users/${selected.user_id}`}
                      className="block text-blue-400 hover:underline text-xs font-mono mt-0.5"
                    >
                      {selected.user_id.slice(0, 12)}…
                    </Link>
                  </div>
                  <div>
                    <span className="text-white/55 text-xs">Email</span>
                    <p className="text-white/80 text-xs mt-0.5">{selected.email ?? "–"}</p>
                  </div>
                  <div>
                    <span className="text-white/55 text-xs">Status</span>
                    <p className="text-white/80 text-xs mt-0.5">{selected.account_status ?? "–"}</p>
                  </div>
                  <div>
                    <span className="text-white/55 text-xs">Flagged</span>
                    <p className={`text-xs mt-0.5 ${selected.is_flagged ? "text-red-400" : "text-green-400"}`}>
                      {selected.is_flagged ? "Yes" : "No"}
                    </p>
                  </div>
                </div>

                {/* Freeze banner */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-3">
                  <p className="text-red-400 text-xs font-semibold mb-1">🔒 Freeze Reason</p>
                  <p className="text-white/70 text-sm">{selected.freeze_reason ?? "No reason recorded"}</p>
                  {selected.frozen_at && (
                    <p className="text-white/45 text-xs mt-1">
                      Since {new Date(selected.frozen_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2 mt-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUnfreeze(selected.user_id)}
                      disabled={unfreezing === selected.user_id}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 transition disabled:opacity-50"
                    >
                      {unfreezing === selected.user_id ? "Unfreezing…" : "Unfreeze Account"}
                    </button>
                    <Link
                      href={`/admin/users/${selected.user_id}`}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition text-center"
                    >
                      View Profile
                    </Link>
                  </div>

                  {/* Temporary unfreeze window */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={tempHours}
                      onChange={(e) => setTempHours(Number(e.target.value))}
                      className="rounded-lg bg-zinc-900 border border-white/10 text-xs text-white/80 px-2 py-1.5 focus:outline-none"
                    >
                      <option value={1}>1 hour</option>
                      <option value={2}>2 hours</option>
                      <option value={4}>4 hours</option>
                      <option value={6}>6 hours</option>
                      <option value={12}>12 hours</option>
                      <option value={24}>24 hours</option>
                    </select>
                    <button
                      onClick={() => handleTempUnfreeze(selected.user_id)}
                      disabled={tempUnfreezing === selected.user_id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition disabled:opacity-50"
                    >
                      {tempUnfreezing === selected.user_id ? "Opening…" : "⏱ Temp Unfreeze"}
                    </button>
                    <span className="text-[10px] text-white/35">Account stays frozen after window</span>
                  </div>
                </div>
              </div>

              {/* Activity Chain (flow diagram) */}
              <ChainView events={timelineEvents} />

              {/* Timeline + Evidence side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CaseTimeline userId={selected.user_id} onEventsLoaded={setTimelineEvents} />
                <EvidencePanel profile={selected} />
              </div>
            </div>
          ) : (
            <div className={`${ui.card} ${ui.cardInner} p-12 text-center`}>
              <p className="text-white/45 text-lg mb-1">← Select a case</p>
              <p className={ui.muted}>Choose a frozen account to investigate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
