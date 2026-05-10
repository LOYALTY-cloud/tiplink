import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

type ProfileReportRow = {
  creator_activity_category: string | null;
  stripe_onboarding_complete: boolean | null;
  created_at: string | null;
};

type CategoryRow = {
  name: string;
  group_name: string;
};

type Bucket = {
  category_key: string;
  category_label: string;
  category_group: string;
  creators_total: number;
  onboarding_complete: number;
  onboarding_incomplete: number;
  completion_rate: number;
};

function toCategoryKey(value: string | null): string {
  const v = (value || "").trim();
  return v.length > 0 ? v : "uncategorized";
}

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "all";
    const rangeDays = range === "7" || range === "30" || range === "90" ? Number(range) : null;

    const { data: categoryData } = await supabaseAdmin
      .from("creator_categories")
      .select("name, group_name")
      .returns<CategoryRow[]>();

    const categoryLookup = new Map<string, CategoryRow>();
    for (const row of categoryData ?? []) {
      categoryLookup.set(row.name, row);
    }

    let query = supabaseAdmin
      .from("profiles")
      .select("creator_activity_category, stripe_onboarding_complete, created_at")
      .eq("is_creator", true);

    if (rangeDays) {
      const threshold = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", threshold);
    }

    const { data, error } = await query.returns<ProfileReportRow[]>();

    if (error) {
      console.error("admin/creators/onboarding-report GET:", error);
      return NextResponse.json({ error: "Failed to load onboarding report" }, { status: 500 });
    }

    const buckets = new Map<string, Bucket>();

    for (const row of data ?? []) {
      const key = toCategoryKey(row.creator_activity_category);
      const categoryMeta = categoryLookup.get(key);
      const current = buckets.get(key) || {
        category_key: key,
        category_label: categoryMeta?.name || (key === "uncategorized" ? "Uncategorized" : key),
        category_group: categoryMeta?.group_name || "Other",
        creators_total: 0,
        onboarding_complete: 0,
        onboarding_incomplete: 0,
        completion_rate: 0,
      };

      current.creators_total += 1;
      if (row.stripe_onboarding_complete) {
        current.onboarding_complete += 1;
      } else {
        current.onboarding_incomplete += 1;
      }

      buckets.set(key, current);
    }

    const byCategory = Array.from(buckets.values())
      .map((row) => ({
        ...row,
        completion_rate: row.creators_total > 0
          ? Number(((row.onboarding_complete / row.creators_total) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.creators_total - a.creators_total);

    const totals = byCategory.reduce(
      (acc, row) => {
        acc.creators_total += row.creators_total;
        acc.onboarding_complete += row.onboarding_complete;
        acc.onboarding_incomplete += row.onboarding_incomplete;
        return acc;
      },
      {
        creators_total: 0,
        onboarding_complete: 0,
        onboarding_incomplete: 0,
      }
    );

    const overall_completion_rate = totals.creators_total > 0
      ? Number(((totals.onboarding_complete / totals.creators_total) * 100).toFixed(1))
      : 0;

    return NextResponse.json({
      totals: {
        ...totals,
        overall_completion_rate,
      },
      by_category: byCategory,
      filter: {
        range: rangeDays ? String(rangeDays) : "all",
      },
      generated_at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("admin/creators/onboarding-report GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
