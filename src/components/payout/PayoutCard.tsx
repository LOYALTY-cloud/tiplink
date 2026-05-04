import PayoutTimeline from "@/components/payout/PayoutTimeline";

type PayoutCardData = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "paid" | "failed" | string;
  requested_at?: string | null;
  created_at?: string;
  processed_at?: string | null;
  paid_at?: string | null;
  receipt_url?: string | null;
  failure_reason?: string | null;
};

function StatusBadge({ status }: { status: PayoutCardData["status"] }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    processing: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    paid: "bg-green-500/20 text-green-300 border border-green-500/30",
    failed: "bg-red-500/20 text-red-300 border border-red-500/30",
  };

  const style = map[status] ?? "bg-white/10 text-white/70 border border-white/20";

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}

export default function PayoutCard({ payout }: { payout: PayoutCardData }) {
  return (
    <div className="bg-[#0B1220] p-4 rounded-2xl border border-white/10">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-sm font-semibold">${Number(payout.amount).toFixed(2)}</p>
        <StatusBadge status={payout.status} />
      </div>

      <PayoutTimeline payout={payout} />

      {payout.status === "paid" && payout.receipt_url && (
        <a
          href={payout.receipt_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-xs text-blue-300 hover:text-blue-200 transition underline underline-offset-2"
        >
          View Receipt
        </a>
      )}

      {payout.status === "failed" && payout.failure_reason && (
        <p className="mt-3 text-xs text-red-300/90">{payout.failure_reason}</p>
      )}
    </div>
  );
}
