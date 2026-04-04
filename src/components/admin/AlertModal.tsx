"use client";

interface AlertData {
  admin: string;
  targetUser: string;
  overrideType: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  time: Date;
}

export default function AlertModal({
  data,
  onClose,
}: {
  data: AlertData;
  onClose: () => void;
}) {
  const friendlyType: Record<string, string> = {
    override_withdrawal_limit: "Withdrawal Limit → Unlimited",
    unlock_withdrawal: "Withdrawal Unlocked",
    unflag: "User Unflagged",
    clear_restriction: "Restriction Cleared",
    bypass_verification: "Verification Bypassed",
    override_risk_score: "Risk Score Reset",
    manual_flag: "User Manually Flagged",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-red-500/30 p-6 shadow-xl animate-in fade-in zoom-in">
        <div className="text-red-500 font-bold text-lg mb-4 flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          High-Severity Override Detected
        </div>

        <div className="space-y-2 text-sm text-zinc-300">
          <p>
            <span className="text-zinc-500">Admin:</span>{" "}
            <span className="font-medium text-white">{data.admin}</span>
          </p>
          <p>
            <span className="text-zinc-500">Target User:</span>{" "}
            <span className="font-medium text-white">{data.targetUser}</span>
          </p>
          <p>
            <span className="text-zinc-500">Action:</span>{" "}
            <span className="font-semibold text-red-400">
              {friendlyType[data.overrideType] ?? data.overrideType}
            </span>
          </p>
          <p>
            <span className="text-zinc-500">Reason:</span>{" "}
            <span className="text-white">{data.reason}</span>
          </p>
          <p className="text-xs text-zinc-500 pt-1">
            {data.time.toLocaleString()}
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="flex-1 rounded-xl bg-white text-black font-medium py-2 hover:bg-zinc-200 transition"
            onClick={() => {
              window.location.href = "/admin/overrides";
            }}
          >
            View Overrides
          </button>

          <button
            className="flex-1 rounded-xl border border-white/20 text-white py-2 hover:bg-white/10 transition"
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
