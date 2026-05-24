"use client";

import { useState } from "react";
import { ui } from "@/lib/ui";

const POLICY_VERSION = "1.0";

const CHECKS = [
  {
    key: "ownership",
    label:
      "I confirm I own this content OR have commercial rights/licenses to use it.",
  },
  {
    key: "trademarks",
    label:
      "I understand copyrighted, trademarked, or stolen material will be removed without notice.",
  },
  {
    key: "strikes",
    label:
      "I understand repeated violations can permanently ban my creator account.",
  },
  {
    key: "moderation",
    label:
      "I understand 1neLink may review, flag, or remove themes for safety, legal, or policy reasons.",
  },
  {
    key: "fakeOfficial",
    label: "I understand fake \"official\" branded themes are strictly prohibited.",
  },
  {
    key: "terms",
    label: "I agree to the Creator Theme Store Terms & Policies.",
  },
] as const;

type CheckKey = typeof CHECKS[number]["key"];

interface Props {
  onAccept: (policyVersion: string) => void;
  onDecline: () => void;
  loading?: boolean;
}

export default function CreatorLegalModal({ onAccept, onDecline, loading }: Props) {
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(
    Object.fromEntries(CHECKS.map((c) => [c.key, false])) as Record<CheckKey, boolean>,
  );

  const allChecked = CHECKS.every((c) => checks[c.key]);

  function toggle(key: CheckKey) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6">
      <div className={`${ui.card} w-full max-w-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto`}>
        <h1 className={`${ui.h1} mb-2`}>Creator Theme Store Agreement</h1>
        <p className={`${ui.muted2} text-sm mb-6`}>
          Before uploading or selling themes, you must read and accept all of the following.
        </p>

        <div className="space-y-4">
          {CHECKS.map((c) => (
            <label
              key={c.key}
              className="flex gap-3 items-start cursor-pointer group"
              onClick={() => toggle(c.key)}
            >
              <div
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border transition
                  ${checks[c.key]
                    ? "bg-blue-500 border-blue-500"
                    : "bg-white/5 border-white/20 group-hover:border-white/40"
                  } flex items-center justify-center`}
              >
                {checks[c.key] && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className={`text-sm leading-relaxed ${checks[c.key] ? "text-white" : "text-white/70"}`}>
                {c.label}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            className={ui.btnGhost}
            onClick={onDecline}
            disabled={loading}
          >
            Decline
          </button>
          <button
            className={ui.btnPrimary}
            disabled={!allChecked || loading}
            onClick={() => onAccept(POLICY_VERSION)}
          >
            {loading ? "Saving…" : "Confirm & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
