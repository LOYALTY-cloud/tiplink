export type ThemeActivityAction = "view" | "preview" | "apply" | "purchase" | "favorite";

export type ThemeActivityRecord = {
  action: ThemeActivityAction;
  category_slug: string | null;
  animation_type: string | null;
  creator_id?: string | null;
  price?: number | null;
};

export type RecommendableTheme = {
  id: string;
  base_price: number;
  unlock_count: number;
  is_verified?: boolean;
  creator_id?: string | null;
  category?: { slug: string | null } | null;
  config?: Record<string, unknown> | null;
};

export type UserThemePreferences = {
  categories: string[];
  animations: string[];
  creators: string[];
  avgPrice: number | null;
};

const ACTION_WEIGHTS: Record<ThemeActivityAction, number> = {
  view: 1,
  preview: 2,
  apply: 3,
  favorite: 4,
  purchase: 5,
};

function topKeys(map: Map<string, number>, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function deriveUserThemePreferences(activities: ThemeActivityRecord[]): UserThemePreferences {
  const categoryScores = new Map<string, number>();
  const animationScores = new Map<string, number>();
  const creatorScores = new Map<string, number>();
  let weightedPrice = 0;
  let weightedCount = 0;

  for (const activity of activities) {
    const weight = ACTION_WEIGHTS[activity.action] ?? 1;

    if (activity.category_slug) {
      categoryScores.set(activity.category_slug, (categoryScores.get(activity.category_slug) ?? 0) + weight);
    }

    if (activity.animation_type) {
      animationScores.set(activity.animation_type, (animationScores.get(activity.animation_type) ?? 0) + weight);
    }

    if (activity.creator_id) {
      creatorScores.set(activity.creator_id, (creatorScores.get(activity.creator_id) ?? 0) + weight);
    }

    if (typeof activity.price === "number" && Number.isFinite(activity.price) && activity.price > 0) {
      weightedPrice += activity.price * weight;
      weightedCount += weight;
    }
  }

  return {
    categories: topKeys(categoryScores, 3),
    animations: topKeys(animationScores, 3),
    creators: topKeys(creatorScores, 2),
    avgPrice: weightedCount > 0 ? weightedPrice / weightedCount : null,
  };
}

export function getThemeAnimationSignal(theme: RecommendableTheme): string | null {
  const config = theme.config ?? {};
  const motion = typeof config.motion === "string" ? config.motion : null;
  const animationType = typeof config.animationType === "string" ? config.animationType : null;
  const animation = typeof config.animation === "string" ? config.animation : null;
  return motion ?? animationType ?? animation;
}

export function scoreThemeForUser(theme: RecommendableTheme, prefs: UserThemePreferences): number {
  let score = 0;
  const categorySlug = theme.category?.slug ?? null;
  const animationSignal = getThemeAnimationSignal(theme);

  if (categorySlug && prefs.categories.includes(categorySlug)) score += 3;
  if (animationSignal && prefs.animations[0] && animationSignal === prefs.animations[0]) score += 2;
  if (theme.creator_id && prefs.creators.includes(theme.creator_id)) score += 1;
  if (prefs.avgPrice !== null && theme.base_price > 0 && theme.base_price <= prefs.avgPrice) score += 1;
  if (theme.unlock_count >= 50) score += 2;
  if (theme.is_verified) score += 1;
  return score;
}

export function getRecommendedThemes<T extends RecommendableTheme>(themes: T[], activities: ThemeActivityRecord[]) {
  if (activities.length === 0) {
    return [...themes].sort((a, b) => {
      if ((a.is_verified ?? false) && !(b.is_verified ?? false)) return -1;
      if (!(a.is_verified ?? false) && (b.is_verified ?? false)) return 1;
      return b.unlock_count - a.unlock_count;
    });
  }

  const prefs = deriveUserThemePreferences(activities);
  return [...themes].sort((a, b) => scoreThemeForUser(b, prefs) - scoreThemeForUser(a, prefs));
}