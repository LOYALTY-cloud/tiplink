"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import type { StrikeSeverity, StrikeStatus, CreatorRiskLevel } from "@/types/strikes";
import { SEVERITY_LABELS, RISK_LEVEL_LABELS, RISK_LEVEL_DESCRIPTIONS } from "@/types/strikes";

interface Strike {
  id: string;
  severity: StrikeSeverity;
  reason: string;
  strike_points: number;
  status: StrikeStatus;
  created_at: string;
  expires_at: string | null;
  theme_id: string | null;
}

interface ViolationsData {
  strikes: Strike[];
  creator_strike_points: number;
  creator_risk_level: CreatorRiskLevel;
  marketplace_disabled: boolean;
}

const SEVERITY_BADGE: Record<StrikeSeverity, string> = {
  warning:  "bg-yellow-500/20 text-yellow-300 border border-yellow-500/25",
  minor:    "bg-orange-500/20 text-orange-300 border border-orange-500/25",
  major:    "bg-red-500/20 text-red-300 border border-red-500/25",
  critical: "bg-red-800/30 text-red-200 border border-red-600/40 font-bold",
};

const STATUS_BADGE: Record<StrikeStatus, { label: string; cls: string }> = {
  active:   { label: "Active",          cls: "bg-red-500/20 text-red-300 border border-red-500/25"       },
  appealed: { label: "Under Appeal",    cls: "bg-blue-500/20 text-blue-300 border border-blue-500/25"   },
  removed:  { label: "Removed",         cls: "bg-green-500/20 text-green-300 border border-green-500/25" },
  expired:  { label: "Expired",         cls: "bg-white/10 text-white/40 border border-white/10"          },
};

const RISK_BADGE: Record<CreatorRiskLevel, string> = {
  normal:     "bg-green-500/20 text-green-300 border border-green-500/25",
  watch:      "bg-yellow-500/20 text-yellow-300 border border-yellow-500/25",
  restricted: "bg-orange-500/20 text-orange-300 border border-orange-500/25",
  high_risk:  "bg-red-500/20 text-red-300 border border-red-500/25",
  banned:     "bg-red-800/30 text-red-200 border border-red-600/40",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export default function ViolationsPage() {
  const [data,    setData]    = useState<ViolationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = "/auth/sign-in?next=/dashboard/account/violations";
          return;
        }

        const res = await fetch("/api/account/violations", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load violations");
        setData(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg0, #050A1A)" }}>
        <p className="text-white/40 text-sm">Loading violations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg0, #050A1A)" }}>
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <Link href="/dashboard/support" className="text-blue-400 underline text-sm">← Back to Support</Link>
        </div>
      </div>
    );
  }

  const strikes      = data?.strikes ?? [];
  const riskLevel    = data?.creator_risk_level ?? "normal";
  const strikePoints = data?.creator_strike_points ?? 0;
  const mktDisabled  = data?.marketplace_disabled ?? false;

  const activeStrikes = strikes.filter((s) => s.status === "active");

  return (
    <div className="min-h-screen text-white" style={{ background: "var(--bg0, #050A1A)" }}>
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Back nav */}
        <Link href="/dashboard/account" className="text-sm text-white/40 hover:text-white/70 transition">
          ← Account Settings
        </Link>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Violations</h1>
          <p className="text-sm text-white/50 mt-1">
            Review your account standing, active strikes, and appeals.
          </p>
        </div>

        {/* Risk Level Card */}
        <div className={`${ui.card} p-5`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide font-medium mb-1">Account Standing</p>
              <div className="flex items-center gap-2">
                <span className={`text-sm px-3 py-1 rounded-full font-semibold ${RISK_BADGE[riskLevel]}`}>
                  {RISK_LEVEL_LABELS[riskLevel]}
                </span>
                {strikePoints > 0 && (
                  <span className="text-xs text-white/40">{strikePoints} strike pt{strikePoints !== 1 ? "s" : ""}</span>
                )}
              </div>
              <p className="text-sm text-white/60 mt-2">{RISK_LEVEL_DESCRIPTIONS[riskLevel]}</p>
            </div>
            {mktDisabled && (
              <div className="rounded-xl bg-orange-500/10 border border-orange-500/25 px-4 py-3 text-sm text-orange-300 text-center shrink-0">
                Marketplace<br />
                <span className="font-semibold">Disabled</span>
              </div>
            )}
          </div>

          {riskLevel !== "normal" && (
            <div className="mt-4 pt-4 border-t border-white/[0.07]">
              <p className="text-xs text-white/50 mb-2">
                Your account standing is calculated from your active strike points. Strikes can be
                appealed or may expire. Contact support if you believe this is an error.
              </p>
              <Link
                href="/dashboard/support"
                className="text-xs text-blue-400 underline hover:text-blue-300"
              >
                Contact Support →
              </Link>
            </div>
          )}
        </div>

        {/* Strikes List */}
        <div>
          <h2 className="text-base font-semibold mb-3">
            Strike History
            {activeStrikes.length > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                {activeStrikes.length} active
              </span>
            )}
          </h2>

          {strikes.length === 0 ? (
            <div className={`${ui.card} p-8 text-center`}>
              <p className="text-white/40 text-sm">No violations on record.</p>
              <p className="text-white/25 text-xs mt-1">Your account is in good standing.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {strikes.map((strike) => (
                <div key={strike.id} className={`${ui.card} p-4`}>
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_BADGE[strike.severity]}`}>
                        {SEVERITY_LABELS[strike.severity]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[strike.status].cls}`}>
                        {STATUS_BADGE[strike.status].label}
                      </span>
                      <span className="text-xs text-white/30">
                        {strike.strike_points} pt{strike.strike_points !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-xs text-white/30">{fmtDate(strike.created_at)}</span>
                  </div>

                  <p className="text-sm text-white/80 mt-2">{strike.reason}</p>

                  {strike.expires_at && (
                    <p className="text-xs text-white/40 mt-1">
                      {new Date(strike.expires_at) > new Date() ? "Expires" : "Expired"}: {fmtDate(strike.expires_at)}
                    </p>
                  )}

                  {strike.status === "active" && (
                    <div className="mt-3 pt-3 border-t border-white/[0.07]">
                      <Link
                        href="/dashboard/support"
                        className="text-xs text-blue-400 underline hover:text-blue-300"
                      >
                        Appeal this strike →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className={`${ui.card} p-4 text-xs text-white/40 space-y-1`}>
          <p className="font-medium text-white/60 mb-2">Understanding Strike Points</p>
          <p>Warning = 1 pt · Minor = 2 pts · Major = 5 pts · Critical = 10 pts</p>
          <p>3–5 pts: Watch status · 6–10 pts: Marketplace restrictions · 11–14 pts: Payout review · 15+ pts: Suspension review</p>
          <p className="pt-1">Strikes expire based on their set duration or can be removed after a successful appeal. Your standing updates automatically.</p>
        </div>

      </div>
    </div>
  );
}
