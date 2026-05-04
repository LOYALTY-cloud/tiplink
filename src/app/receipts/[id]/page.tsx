import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PayoutRow {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  stripe_transfer_id: string | null;
  tax_year: number | null;
  total_earnings_snapshot: number | null;
  created_at: string;
  processed_at: string | null;
}

interface ProfileRow {
  display_name: string | null;
  handle: string | null;
  email: string | null;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: payout } = await supabaseAdmin
    .from("payout_requests")
    .select("id, user_id, amount, status, stripe_transfer_id, tax_year, total_earnings_snapshot, created_at, processed_at")
    .eq("id", id)
    .maybeSingle<PayoutRow>();

  if (!payout) notFound();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, handle, email")
    .eq("user_id", payout.user_id)
    .maybeSingle<ProfileRow>();

  const displayName = profile?.display_name ?? profile?.handle ?? "Creator";
  const statusLabel = payout.status === "paid" ? "Paid" : payout.status.charAt(0).toUpperCase() + payout.status.slice(1);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-white/30 text-xs tracking-widest uppercase mb-2">TipLink</p>
          <h1 className="text-2xl font-bold text-white">Payout Receipt</h1>
        </div>

        {/* Receipt card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">

          {/* Amount banner */}
          <div className="bg-white/[0.05] border-b border-white/10 p-8 text-center">
            <p className="text-xs text-white/40 mb-1">Amount Transferred</p>
            <p className="text-5xl font-bold text-white">${fmt(Number(payout.amount))}</p>
            <span className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold ${
              payout.status === "paid"
                ? "bg-green-400/15 text-green-400"
                : payout.status === "failed"
                  ? "bg-red-400/15 text-red-400"
                  : "bg-white/10 text-white/60"
            }`}>
              {statusLabel}
            </span>
          </div>

          {/* Details */}
          <div className="p-6 space-y-0 divide-y divide-white/5">
            <Row label="Recipient" value={displayName} />
            <Row label="Payout ID" value={payout.id} mono />
            {payout.stripe_transfer_id && (
              <Row label="Transfer ID" value={payout.stripe_transfer_id} mono />
            )}
            <Row label="Date Requested" value={fmtDate(payout.created_at)} />
            {payout.processed_at && (
              <Row label="Date Processed" value={fmtDate(payout.processed_at)} />
            )}
            {payout.tax_year && (
              <Row label="Tax Year" value={String(payout.tax_year)} />
            )}
            {payout.total_earnings_snapshot != null && (
              <Row
                label="Earnings at Payout"
                value={`$${fmt(Number(payout.total_earnings_snapshot))}`}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-white/20">
            This receipt is issued by TipLink. Transfers are processed via Stripe Connect.
          </p>
          {payout.tax_year && (
            <p className="text-xs text-white/20">
              For tax questions, consult your tax advisor. Keep this receipt for your {payout.tax_year} records.
            </p>
          )}
          <Link
            href="/dashboard/themebuilder?tab=analytics"
            className="inline-block mt-2 text-xs text-white/40 hover:text-white/70 transition underline underline-offset-4"
          >
            Back to earnings
          </Link>
        </div>

      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <span className="text-xs text-white/40 shrink-0">{label}</span>
      <span
        className={`text-xs text-right break-all ${
          mono ? "font-mono text-white/60" : "text-white/80 font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
