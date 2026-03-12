import { createClient } from "@supabase/supabase-js";
import { ShareButton } from "./ShareButton";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId: encodedReceiptId } = await params;
  const receiptId = decodeURIComponent(encodedReceiptId);

  const { data, error } = await supabasePublic.rpc("get_tip_receipt", {
    rid: receiptId,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] p-6 flex items-center justify-center">
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="text-xl font-semibold text-gray-900">Receipt not found</div>
          <p className="mt-2 text-sm text-gray-600">
            This receipt ID may be invalid or expired.
          </p>
        </div>
      </div>
    );
  }

  const creatorName =
    row.creator_display_name || row.creator_handle || "Creator";

  return (
    <div className="min-h-screen bg-[#F7F7F8] p-6 flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-gray-500">TIPLINKME</div>
            <div className="text-2xl font-semibold text-gray-900">Receipt</div>
            <p className="mt-1 text-sm text-gray-600">
              Private support confirmation.
            </p>
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Confirmed
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Receipt ID</span>
            <span className="text-sm font-semibold text-gray-900">
              {row.receipt_id}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Creator</span>
            <span className="text-sm font-semibold text-gray-900">
              {creatorName}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Amount</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatMoney(Number(row.amount))}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Date</span>
            <span className="text-sm font-semibold text-gray-900">
              {new Date(row.created_at).toLocaleString()}
            </span>
          </div>

          <div className="pt-2 text-xs text-gray-500">
            This support is private. The creator will not see your email or identity unless you choose to share it.
          </div>
        </div>

        <ShareButton receiptId={row.receipt_id} />

        <div className="mt-4 text-xs text-gray-500 text-center">
          © {new Date().getFullYear()} TIPLINKME
        </div>
      </div>
    </div>
  );
}
