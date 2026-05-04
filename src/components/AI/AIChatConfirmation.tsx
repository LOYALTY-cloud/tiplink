/**
 * AI Chat Confirmation + Simulation Preview Component
 * Sandbox mode: Simulate → Show Impact → Confirm → Execute
 */

"use client";

import { useState } from "react";

type SimulationData = {
  mode?: string;
  total?: number;
  estimatedSuccess?: number;
  estimatedFailure?: number;
  [key: string]: unknown;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tool?: string;
  data?: any;
  requiresConfirmation?: boolean;
  requiresReAuth?: boolean;
  simulation?: SimulationData | null;
  pendingTool?: string;
  pendingArgs?: any;
};

interface AIChatConfirmationProps {
  message: ChatMessage;
  onConfirm: (confirmationText: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// ── Simulation preview card ──────────────────────────────────────────────────
function SimulationCard({ simulation }: { simulation: SimulationData }) {
  const total = simulation.total ?? 0;
  const estimated = typeof simulation.estimatedSuccess === "number";

  return (
    <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-yellow-300">🔍 Simulation Preview</span>
        <span className="text-[10px] uppercase tracking-wider text-yellow-400/60 bg-yellow-500/10 border border-yellow-400/15 rounded-full px-2 py-0.5">
          No changes made
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-wide">Affected</p>
          <p className="text-lg font-semibold text-white mt-0.5">{total}</p>
        </div>

        {estimated && (
          <>
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-center">
              <p className="text-[10px] text-green-300/60 uppercase tracking-wide">Est. Success</p>
              <p className="text-lg font-semibold text-green-300 mt-0.5">
                ~{simulation.estimatedSuccess}
              </p>
            </div>

            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-center">
              <p className="text-[10px] text-red-300/60 uppercase tracking-wide">Est. Failure</p>
              <p className="text-lg font-semibold text-red-300 mt-0.5">
                ~{simulation.estimatedFailure}
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-[11px] text-yellow-300/60">
        ↑ Estimated impact only. No balance changes. Confirm below to execute.
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function AIChatConfirmation({
  message,
  onConfirm,
  onCancel,
  isLoading = false,
}: AIChatConfirmationProps) {
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isHighRisk = message.requiresReAuth ?? false;
  const simulation = message.simulation ?? null;
  // High-risk tools now require "EXECUTE" to make the action feel deliberate
  const REQUIRED_TEXT = isHighRisk ? "EXECUTE" : "CONFIRM";
  const isValid = confirmationText === REQUIRED_TEXT;

  async function handleSubmit() {
    if (!isValid) {
      setError(`Please type "${REQUIRED_TEXT}" exactly`);
      return;
    }

    try {
      setError(null);
      await onConfirm(confirmationText);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Confirmation failed";
      setError(errorMsg);
    }
  }

  return (
    <div className="space-y-4 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-white">
          {isHighRisk ? "🔐 High-Risk Action" : "⚠️ Confirmation Required"}
        </p>
        <p className="text-xs text-white/60 mt-1">
          {message.content}
        </p>
      </div>

      {/* Simulation card (shown for high-risk tools that support it) */}
      {simulation && <SimulationCard simulation={simulation} />}

      {/* Security Notice */}
      <div className="bg-red-500/5 border border-red-500/20 rounded px-3 py-2">
        <p className="text-xs text-red-300">
          {isHighRisk
            ? `Review the simulation above. Type ${REQUIRED_TEXT} below to execute for real.`
            : `This operation requires confirmation. Type ${REQUIRED_TEXT} to proceed.`}
        </p>
      </div>

      {/* Input Area */}
      <div className="space-y-2">
        <label htmlFor="confirm-input" className="text-xs text-white/70">
          Type <span className="font-mono font-semibold text-yellow-300">&quot;{REQUIRED_TEXT}&quot;</span> to proceed:
        </label>
        <div className="flex gap-2">
          <input
            id="confirm-input"
            type="text"
            value={confirmationText}
            onChange={(e) => {
              setConfirmationText(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder={`Type ${REQUIRED_TEXT}`}
            className={`flex-1 px-3 py-2 rounded border text-sm bg-white/5 text-white placeholder:text-white/30 outline-none transition ${
              isValid
                ? "border-green-500/50 focus:border-green-400"
                : confirmationText
                  ? "border-red-500/50 focus:border-red-400"
                  : "border-white/10 focus:border-white/20"
            }`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) {
                handleSubmit();
              }
            }}
          />
        </div>
        {error && (
          <p className="text-xs text-red-300">❌ {error}</p>
        )}
        {confirmationText && !isValid && (
          <p className="text-xs text-yellow-300">
            Please type exactly: <span className="font-mono">{REQUIRED_TEXT}</span>
          </p>
        )}
        {isValid && (
          <p className="text-xs text-green-300">✓ Ready to {isHighRisk ? "execute" : "confirm"}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          className={`flex-1 px-3 py-2 rounded text-xs font-medium transition ${
            isValid && !isLoading
              ? isHighRisk
                ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                : "bg-yellow-600 hover:bg-yellow-500 text-white cursor-pointer"
              : "bg-red-600/30 text-white/50 cursor-not-allowed"
          }`}
        >
          {isLoading ? "Executing…" : isHighRisk ? "Execute" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-3 py-2 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {/* Security Note */}
      <div className="text-[11px] text-white/40 bg-white/5 border border-white/10 rounded px-2 py-1">
        <p>
          🔒 This action is logged and audited. Only the system operator can confirm this action.
        </p>
      </div>
    </div>
  );
}

/**
 * Example usage in a chat component:
 * See docs/AI_SECURITY_GUARDRAILS.md for full implementation example
 */
