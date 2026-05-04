export const CURATED_THEME_CATEGORIES = [
  { name: "Luxury", slug: "luxury" },
  { name: "Dark", slug: "dark" },
  { name: "Neon", slug: "neon" },
  { name: "Minimal", slug: "minimal" },
  { name: "Aesthetic", slug: "aesthetic" },
  { name: "Anime", slug: "anime" },
  { name: "Street", slug: "street" },
  { name: "Soft", slug: "soft" },
  { name: "Futuristic", slug: "futuristic" },
] as const;

export type ThemeCategorySlug = (typeof CURATED_THEME_CATEGORIES)[number]["slug"];

function toLowerString(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isDarkHex(value: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.2;
}

export function detectThemeCategorySlug(config: Record<string, unknown>): ThemeCategorySlug | null {
  const motion = toLowerString(config.motion);
  const overlay = toLowerString(config.overlay);
  const lighting = toLowerString(config.lighting);
  const animation = toLowerString(config.animation);
  const animationType = toLowerString(config.animationType);
  const primaryColor = toLowerString(config.primaryColor);
  const textColor = toLowerString(config.textColor);

  if (motion.includes("neon") || animation.includes("neon") || animationType.includes("neon")) {
    return "neon";
  }

  if (overlay === "dust" || lighting.includes("halo") || motion.includes("depth3d")) {
    return "futuristic";
  }

  if (isDarkHex(primaryColor) || isDarkHex(textColor) || primaryColor === "#000000") {
    return "dark";
  }

  if (!motion && !overlay && !lighting && animation === "none") {
    return "minimal";
  }

  return null;
}