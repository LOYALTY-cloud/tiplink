import { createClient } from "@supabase/supabase-js";
import { ShareButton } from "./ShareButton";
import { ReceiptStatusPoller } from "./ReceiptStatusPoller";
import { getTheme } from "@/lib/getTheme";

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

  // Fetch creator theme from profile
  let creatorTheme: string | null = null;
  if (row.creator_user_id) {
    const { data: profileData } = await supabasePublic
      .from("profiles")
      .select("theme")
      .eq("user_id", row.creator_user_id)
      .maybeSingle();
    creatorTheme = profileData?.theme ?? null;
  }
  const theme = getTheme(creatorTheme);

  return (
    <div className={`min-h-screen p-6 flex items-center justify-center ${theme.bg} ${theme.text} ${theme.wrapper}`}>
      <div className={`w-full max-w-md rounded-2xl p-6 shadow-sm border ${theme.card}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-xs font-medium ${theme.muted2}`}>1NELINK</div>

            {/* Success state */}
            <div className="text-emerald-400 text-sm font-medium">
              ✔ Payment Successful
            </div>

            <div className="text-2xl font-semibold">Receipt</div>

            <p className={`mt-1 text-sm ${theme.muted}`}>
              Private support confirmation.
            </p>
          </div>
          <ReceiptStatusPoller receiptId={row.receipt_id} />
        </div>

        {/* Receipt Details */}
        <div className={`mt-5 rounded-2xl border ${theme.border} ${theme.inputBg} p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm ${theme.muted}`}>Receipt ID</span>
            <span className="text-sm font-semibold">
              {row.receipt_id}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-sm ${theme.muted}`}>Creator</span>
            <span className="text-sm font-semibold">
              {creatorName}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-sm ${theme.muted}`}>Amount</span>
            <span className="text-sm font-semibold">
              {formatMoney(Number(row.amount))}
            </span>
          </div>

          {/* Payment breakdown */}
          <div className="flex items-center justify-between">
            <span className={`text-sm ${theme.muted}`}>Platform Fee</span>
            <span className="text-sm font-semibold">
              {formatMoney(Number(row.platform_fee || 0))}
            </span>
          </div>

          <div className={`flex items-center justify-between border-t ${theme.border} pt-2 mt-2`}>
            <span className={`text-sm ${theme.muted}`}>Total Paid</span>
            <span className="text-sm font-semibold">
              {formatMoney(Number(row.amount) + Number(row.platform_fee || 0))}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-sm ${theme.muted}`}>Date</span>
            <span className="text-sm font-semibold">
              {new Date(row.created_at).toLocaleString()}
            </span>
          </div>

          <div className={`pt-2 text-xs ${theme.muted2}`}>
            This support is private. The creator will not see your email or identity unless you choose to share it.
          </div>
        </div>

        {/* Share */}
        <ShareButton receiptId={row.receipt_id} />

        {/* Tip again */}
        {row.creator_handle && (
          <a
            href={`/@${row.creator_handle}`}
            className={`block mt-3 text-center py-2 rounded-xl font-semibold ${theme.button} ${theme.glow}`}
          >
            Tip Again
          </a>
        )}

        {/* Trust badge */}
        <div className={`mt-3 text-[11px] ${theme.muted2} text-center`}>
          🔒 Secure payment processed by 1neLink
        </div>

        <div className={`mt-4 text-xs ${theme.muted2} text-center`}>
          © {new Date().getFullYear()} 1NELINK
        </div>
      </div>
    </div>
  );
}
