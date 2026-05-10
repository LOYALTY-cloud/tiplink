import {
  DEFAULT_CREATOR_CATEGORIES,
  findDefaultCreatorCategory,
  getDefaultCreatorCategory,
  normalizeCreatorCategoryName,
  type CreatorCategory,
} from "@/lib/creatorCategories";

export const CREATOR_ACTIVITY_OPTIONS = DEFAULT_CREATOR_CATEGORIES.map((c) => c.name);

export type CreatorActivityCategory = string;

export function isCreatorActivityCategory(value: unknown): value is CreatorActivityCategory {
  const normalized = normalizeCreatorCategoryName(value);
  if (!normalized) return false;
  return DEFAULT_CREATOR_CATEGORIES.some((c) => c.name.toLowerCase() === normalized.toLowerCase());
}

export function getCreatorCategoryDefaults(): CreatorCategory[] {
  return DEFAULT_CREATOR_CATEGORIES;
}

export function getStripeProductDescription(category: unknown): string {
  return (
    findDefaultCreatorCategory(category)?.stripe_description ||
    getDefaultCreatorCategory().stripe_description
  );
}
