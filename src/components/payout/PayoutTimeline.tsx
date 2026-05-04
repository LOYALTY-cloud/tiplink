type PayoutForTimeline = {
  status: string;
  requested_at?: string | null;
  created_at?: string;
  processed_at?: string | null;
  paid_at?: string | null;
};

function fmtTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function PayoutTimeline({ payout }: { payout: PayoutForTimeline }) {
  const requestedTime = payout.requested_at ?? payout.created_at ?? null;
  const steps = [
    {
      label: "Requested",
      time: requestedTime,
      done: true,
    },
    {
      label: "Processing",
      time: payout.processed_at,
      done: payout.status !== "pending",
    },
    {
      label: "Paid",
      time: payout.paid_at,
      done: payout.status === "paid",
    },
  ];

  return (
    <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/10">
      <p className="text-sm font-semibold mb-4">Payout Status</p>

      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div
              className={`w-3 h-3 mt-1 rounded-full ${
                step.done ? "bg-green-400" : "bg-white/20"
              }`}
            />

            <div>
              <p className="text-sm">{step.label}</p>
              {step.time && (
                <p className="text-xs text-white/50">{fmtTime(step.time)}</p>
              )}
              {!step.time && step.done && (
                <p className="text-xs text-white/40">Updated</p>
              )}
            </div>
          </div>
        ))}

        {payout.status === "failed" && (
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 mt-1 rounded-full bg-red-400" />
            <div>
              <p className="text-sm text-red-300">Failed</p>
              {payout.processed_at && (
                <p className="text-xs text-white/50">{fmtTime(payout.processed_at)}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
