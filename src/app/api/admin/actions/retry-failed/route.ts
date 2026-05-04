import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAdminActivity } from "@/lib/adminActivityLog";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

type RetryResult = {
  success: boolean;
  retriedCount: number;
  failedRetries: number;
  errors: string[];
};

export async function POST(req: Request): Promise<Response> {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      requireRole(admin.role, ["owner"]);
    } catch {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const result: RetryResult = {
      success: true,
      retriedCount: 0,
      failedRetries: 0,
      errors: [],
    };

    // Find all failed transactions from the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: failedTransactions, error: fetchError } = await supabaseAdmin
      .from("transactions_ledger")
      .select("id, type, metadata, user_id")
      .eq("status", "failed")
      .gte("created_at", since)
      .limit(50);

    if (fetchError) {
      result.errors.push(`Failed to fetch transactions: ${fetchError.message}`);
      await logAdminActivity({
        type: "payment",
        action: "retry_failed_transactions",
        title: "Retry Failed Transactions",
        description: `Attempted to retry failed transactions but fetch failed: ${fetchError.message}`,
        severity: "warning",
        metadata: {
          retriedCount: 0,
          failedRetries: 0,
          error: fetchError.message,
        },
      });
      return Response.json(result, { status: 200 });
    }

    if (!failedTransactions || failedTransactions.length === 0) {
      await logAdminActivity({
        type: "payment",
        action: "retry_failed_transactions",
        title: "Retry Failed Transactions",
        description: "No failed transactions found in last 24 hours",
        severity: "info",
        metadata: {
          retriedCount: 0,
          failedRetries: 0,
        },
      });
      return Response.json(result, { status: 200 });
    }

    // Attempt to retry each transaction
    for (const transaction of failedTransactions) {
      try {
        // Update transaction status to pending
        const { error: updateError } = await supabaseAdmin
          .from("transactions_ledger")
          .update({
            status: "pending",
            updated_at: new Date().toISOString(),
            metadata: {
              ...transaction.metadata,
              retry_attempts: (transaction.metadata?.retry_attempts ?? 0) + 1,
              last_retry_at: new Date().toISOString(),
              manual_retry_by_admin: admin.userId,
            },
          })
          .eq("id", transaction.id);

        if (updateError) {
          result.failedRetries++;
          result.errors.push(`Transaction ${transaction.id}: ${updateError.message}`);
        } else {
          result.retriedCount++;
        }
      } catch (error) {
        result.failedRetries++;
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Transaction ${transaction.id}: ${message}`);
      }
    }

    // Log the activity
    await logAdminActivity({
      type: "payment",
      action: "retry_failed_transactions",
      title: "Retry Failed Transactions",
      description: `Retried ${result.retriedCount} failed transaction(s), ${result.failedRetries} failed`,
      severity: result.failedRetries > 0 ? "warning" : "info",
      metadata: {
        retriedCount: result.retriedCount,
        failedRetries: result.failedRetries,
        totalTransactions: failedTransactions.length,
        errors: result.errors.slice(0, 5), // Limit error log to 5
      },
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[retry-failed] error:", message);
    return Response.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
