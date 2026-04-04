"use client";

import { ui } from "@/lib/ui";

export type ChainEvent = {
  type: string;
  label: string;
  created_at: string;
  score?: number;
  decision?: string;
  flags?: string[];
  amount?: number;
  severity?: string;
};

const nodeConfig: Record<string, { bg: string; border: string; text: string; emoji: string }> = {
  anomaly:     { bg: "bg-red-500",    border: "border-red-400",    text: "text-red-400",    emoji: "🔴" },
  admin:       { bg: "bg-purple-500", border: "border-purple-400", text: "text-purple-400", emoji: "🛡️" },
  withdrawal:  { bg: "bg-yellow-500", border: "border-yellow-400", text: "text-yellow-400", emoji: "💸" },
  tip:         { bg: "bg-green-500",  border: "border-green-400",  text: "text-green-400",  emoji: "💚" },
  transaction: { bg: "bg-blue-500",   border: "border-blue-400",   text: "text-blue-400",   emoji: "📒" },
  note:        { bg: "bg-white/30",   border: "border-white/20",   text: "text-white/60",   emoji: "📝" },
};

const suspiciousTypes = new Set(["anomaly", "withdrawal", "admin"]);
const dangerDecisions = new Set(["restrict", "review", "confirmed_fraud"]);

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/**
 * Detect session breaks — >30 min gap between events = new session.
 */
function groupIntoSessions(events: ChainEvent[]): ChainEvent[][] {
  if (events.length === 0) return [];
  const sessions: ChainEvent[][] = [[events[0]]];
  for (let i = 1; i < events.length; i++) {
    const gap = new Date(events[i].created_at).getTime() - new Date(events[i - 1].created_at).getTime();
    if (gap > 30 * 60 * 1000) {
      sessions.push([events[i]]);
    } else {
      sessions[sessions.length - 1].push(events[i]);
    }
  }
  return sessions;
}

type Props = {
  events: ChainEvent[];
};

export default function ChainView({ events }: Props) {
  if (events.length === 0) return null;

  const sessions = groupIntoSessions(events);

  return (
    <div className={`${ui.card} ${ui.cardInner} p-4`}>
      <h3 className="text-white font-semibold text-sm mb-3">Activity Chain</h3>

      <div className="space-y-4 overflow-x-auto">
        {sessions.map((session, si) => (
          <div key={si}>
            {/* Session label */}
            {sessions.length > 1 && (
              <p className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-2">
                Session {si + 1} · {formatDate(session[0].created_at)}
              </p>
            )}

            <div className="flex items-center gap-1.5 min-w-0">
              {session.map((e, i) => {
                const cfg = nodeConfig[e.type] ?? nodeConfig.note;
                const isSuspicious = suspiciousTypes.has(e.type);
                const isDanger = e.decision ? dangerDecisions.has(e.decision) : false;
                const showRing = isSuspicious || isDanger;

                const tooltip = [
                  `${capitalize(e.type)}: ${e.label}`,
                  e.score != null ? `Score: ${e.score}` : null,
                  e.amount != null ? `$${e.amount.toFixed(2)}` : null,
                  e.decision ? `Decision: ${e.decision}` : null,
                  e.flags?.length ? `Flags: ${e.flags.join(", ")}` : null,
                  new Date(e.created_at).toLocaleString(),
                ].filter(Boolean).join("\n");

                return (
                  <div key={i} className="flex items-center gap-1.5">
                    {/* Node */}
                    <div className="flex flex-col items-center group relative" title={tooltip}>
                      <div
                        className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center text-white text-[10px] font-bold
                          ${showRing ? "ring-2 ring-red-400/80 ring-offset-1 ring-offset-zinc-900" : ""}
                          transition-transform group-hover:scale-110`}
                      >
                        {cfg.emoji}
                      </div>
                      <span className={`text-[10px] mt-1 font-medium ${cfg.text} whitespace-nowrap`}>
                        {capitalize(e.type)}
                      </span>
                      <span className="text-[9px] text-white/30 whitespace-nowrap">
                        {formatTime(e.created_at)}
                      </span>

                      {/* Hover detail card */}
                      <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50
                        bg-zinc-800 border border-white/10 rounded-lg p-2.5 min-w-[180px] max-w-[260px] shadow-xl pointer-events-none">
                        <p className={`text-xs font-semibold ${cfg.text} mb-1`}>{capitalize(e.type)}</p>
                        <p className="text-white/70 text-[11px] leading-snug break-words">{e.label}</p>
                        {e.score != null && (
                          <p className="text-white/40 text-[10px] mt-1">
                            Score: <span className={e.score >= 70 ? "text-red-400" : e.score >= 40 ? "text-yellow-400" : "text-green-400"}>
                              {e.score}
                            </span>
                          </p>
                        )}
                        {e.amount != null && (
                          <p className="text-white/40 text-[10px]">Amount: ${e.amount.toFixed(2)}</p>
                        )}
                        {e.decision && (
                          <p className="text-white/40 text-[10px]">Decision: <span className={
                            dangerDecisions.has(e.decision) ? "text-red-400" : "text-green-400"
                          }>{e.decision}</span></p>
                        )}
                        {e.flags && e.flags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {e.flags.map((f, fi) => (
                              <span key={fi} className="text-[9px] bg-white/5 border border-white/10 rounded px-1 text-white/50">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Arrow connector */}
                    {i < session.length - 1 && (
                      <div className="flex items-center">
                        <div className="w-5 h-[2px] bg-white/15" />
                        <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-white/15" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/5">
        {Object.entries(nodeConfig).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.bg}`} />
            <span className="text-[10px] text-white/40">{capitalize(type)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-500 ring-1 ring-red-400/80" />
          <span className="text-[10px] text-white/40">Suspicious</span>
        </div>
      </div>
    </div>
  );
}
