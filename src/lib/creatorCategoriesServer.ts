import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_CREATOR_CATEGORIES,
  findDefaultCreatorCategory,
  getDefaultCreatorCategory,
  normalizeCreatorCategoryName,
  type CreatorCategory,
} from "@/lib/creatorCategories";

export async function listCreatorCategories(): Promise<CreatorCategory[]> {
  const { data, error } = await supabaseAdmin
    .from("creator_categories")
    .select("name, group_name, stripe_description, risk_level, payout_delay_days, requires_manual_review")
    .order("group_name", { ascending: true })
    .order("name", { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return DEFAULT_CREATOR_CATEGORIES;
  }

  return data as CreatorCategory[];
}

export async function getCreatorCategoryByName(value: unknown): Promise<CreatorCategory | null> {
  const canonical = normalizeCreatorCategoryName(value);
  if (!canonical) return null;

  const { data, error } = await supabaseAdmin
    .from("creator_categories")
    .select("name, group_name, stripe_description, risk_level, payout_delay_days, requires_manual_review")
    .ilike("name", canonical)
    .maybeSingle();

  if (!error && data) {
    return data as CreatorCategory;
  }

  return findDefaultCreatorCategory(canonical);
}

export async function getStripeProductDescriptionByCategory(value: unknown): Promise<string> {
  const category = await getCreatorCategoryByName(value);
  return category?.stripe_description || getDefaultCreatorCategory().stripe_description;
}
