export type ThemeKey =
  | "default"
  | "dark"
  | "aurora"
  | "gradient"
  | "violet"
  | "bold";

export interface ThemeConfig {
  bg: string;
  text: string;
  card: string;
  button: string;
  muted: string;
  muted2: string;
  border: string;
  inputBg: string;
  wrapper: string;
  glow: string;
}

export const THEMES: Record<ThemeKey, ThemeConfig> = {
  default: {
    bg: "bg-[#050A1A]",
    text: "text-white/90",
    card: "bg-white/5 backdrop-blur-xl border-white/10",
    button: "bg-gradient-to-b from-blue-500 to-blue-700 text-white",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-white/10",
    inputBg: "bg-white/5",
    wrapper: "",
    glow: "",
  },
  dark: {
    bg: "bg-black",
    text: "text-white",
    card: "bg-white/5 border-white/10",
    button: "bg-white text-black",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-white/10",
    inputBg: "bg-white/5",
    wrapper: "",
    glow: "",
  },
  aurora: {
    bg: "aurora-bg",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-purple-400/20 shadow-[0_0_30px_rgba(139,92,246,0.15)]",
    button: "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/30 shimmer-btn",
    muted: "text-white/65",
    muted2: "text-white/40",
    border: "border-purple-400/20",
    inputBg: "bg-white/5",
    wrapper: "",
    glow: "shadow-[0_0_20px_rgba(139,92,246,0.35)]",
  },
  gradient: {
    bg: "bg-gradient-to-br from-purple-600 to-blue-500",
    text: "text-white",
    card: "bg-white/10 border-white/20",
    button: "bg-white text-black",
    muted: "text-white/70",
    muted2: "text-white/50",
    border: "border-white/20",
    inputBg: "bg-white/10",
    wrapper: "",
    glow: "",
  },
  violet: {
    bg: "bg-[#0B0B14]",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_25px_rgba(139,92,246,0.15)]",
    button: "bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-white/10",
    inputBg: "bg-white/5 border border-white/10 text-white placeholder-gray-400",
    wrapper: "bg-gradient-to-br from-[#1a1333] via-[#0B0B14] to-[#2a1f5a]",
    glow: "shadow-[0_0_25px_rgba(139,92,246,0.35)]",
  },
  bold: {
    bg: "bg-red-600",
    text: "text-white",
    card: "bg-red-500 border-red-300",
    button: "bg-black text-white",
    muted: "text-white/70",
    muted2: "text-white/50",
    border: "border-red-300",
    inputBg: "bg-red-700/50",
    wrapper: "",
    glow: "",
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export const FREE_THEMES: ThemeKey[] = ["default", "dark"];

export function isThemeUnlocked(theme: string, unlocked: string[]): boolean {
  if (FREE_THEMES.includes(theme as ThemeKey)) return true;
  if (unlocked.includes("all")) return true;
  return unlocked.includes(theme);
}

export const THEME_PRICE_LABEL = "$1.99";
export const BUNDLE_PRICE_LABEL = "$4.99";
