"use client";

/**
 * RollbackButton — Undo an AI action
 *
 * Usage:
 *   <RollbackButton logId={executionLogId} actionTitle="Retry 12 payments" />
 *
 * Shows only when reversible=true and rolled_back=false.
 * Requires owner to type "UNDO" to confirm before sending the rollback request.
 */

import { useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";

interface RollbackButtonProps {
  logId: string;
  actionTitle?: string;
  onRolledBack?: () => void;
}

type RollbackState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "loading" }
  | { phase: "done"; restored: number }
  | { phase: "error"; message: string };

export function RollbackButton({
  logId,
  actionTitle = "this action",
  onRolledBack,
}: RollbackButtonProps) {
  const [state, setState] = useState<RollbackState>({ phase: "idle" });
  const [confirmText, setConfirmText] = useState("");

  const isConfirmValid = confirmText.trim() === "UNDO";

  function openConfirm() {
    setConfirmText("");
    setState({ phase: "confirming" });
  }

  function cancel() {
    setState({ phase: "idle" });
    setConfirmText("");
  }

  async function executeRollback() {
    if (!isConfirmValid) return;

    setState({ phase: "loading" });

    try {
      const res = await fetch("/api/admin/ai/rollback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ logId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? "Rollback failed" });
        return;
      }

      setState({ phase: "done", restored: json.restored ?? 0 });
      onRolledBack?.();
    } catch {
      setState({ phase: "error", message: "Network error — try again" });
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (state.phase === "done") {
    return (
      <span className="text-xs text-green-400">
        ↩ Rolled back ({state.restored} record{state.restored !== 1 ? "s" : ""} restored)
      </span>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400">❌ {state.message}</span>
        <button
          onClick={cancel}
          className="text-xs text-white/40 hover:text-white/60 underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <span className="text-xs text-yellow-400 animate-pulse">↩ Rolling back…</span>
    );
  }

  if (state.phase === "confirming") {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs w-72">
        <p className="text-orange-300 font-medium">↩ Undo: {actionTitle}</p>
        <p className="text-white/50">
          This will restore all affected records to their previous state.
          Type <span className="font-mono text-white">UNDO</span> to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="UNDO"
          autoFocus
          className={`w-full px-2 py-1 rounded border bg-white/5 text-white placeholder:text-white/30 outline-none text-sm font-mono ${
            isConfirmValid ? "border-green-500/50" : confirmText ? "border-red-500/40" : "border-white/10"
          }`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isConfirmValid) executeRollback();
            if (e.key === "Escape") cancel();
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={executeRollback}
            disabled={!isConfirmValid}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition ${
              isConfirmValid
                ? "bg-orange-600 hover:bg-orange-500 text-white cursor-pointer"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            Undo
          </button>
          <button
            onClick={cancel}
            className="px-2 py-1 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle state
  return (
    <button
      onClick={openConfirm}
      className="text-xs text-orange-400 hover:text-orange-300 transition underline-offset-2 hover:underline"
    >
      ↩ Undo
    </button>
  );
}
