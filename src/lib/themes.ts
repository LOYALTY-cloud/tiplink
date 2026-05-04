export type ThemeKey =
  | "default"
  | "dark"
  | "aurora"
  | "gradient"
  | "violet"
  | "bold"
  | "army_black"
  | "army_pink"
  | "army_red"
  | "pink_luxe"
  | "ice_blue"
  | "lavender"
  | "peach"
  | "glitter";

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
  army_black: {
    bg: "bg-[url('/themes/army-black.png')] bg-cover bg-center",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-white/10",
    button: "bg-white text-black hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-white/10",
    inputBg: "bg-white/10",
    wrapper: "bg-black/60 backdrop-blur-[2px]",
    glow: "shadow-[0_0_25px_rgba(255,255,255,0.15)]",
  },
  army_pink: {
    bg: "bg-[url('/themes/army-pink.png')] bg-cover bg-center",
    text: "text-white",
    card: "bg-black/50 backdrop-blur-xl border-pink-300/20",
    button: "bg-pink-500 text-white shadow-[0_0_25px_rgba(255,0,120,0.4)] hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-pink-300/20",
    inputBg: "bg-white/10",
    wrapper: "bg-black/40 backdrop-blur-[3px]",
    glow: "shadow-[0_0_30px_rgba(255,0,120,0.35)]",
  },
  army_red: {
    bg: "bg-[url('/themes/army-red.png')] bg-cover bg-center",
    text: "text-white",
    card: "bg-black/60 backdrop-blur-xl border-red-300/20",
    button: "bg-red-500 text-white hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-red-300/20",
    inputBg: "bg-white/10",
    wrapper: "bg-black/50 backdrop-blur-[2px]",
    glow: "shadow-[0_0_30px_rgba(255,0,0,0.35)]",
  },
  pink_luxe: {
    bg: "bg-gradient-to-br from-[#1a0a14] via-[#2d0f22] to-[#0f0a14]",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-pink-200/15",
    button: "bg-pink-400 text-white hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-pink-200/15",
    inputBg: "bg-white/8",
    wrapper: "",
    glow: "shadow-[0_0_25px_rgba(244,114,182,0.3)]",
  },
  ice_blue: {
    bg: "bg-gradient-to-br from-[#0a1628] via-[#0f2847] to-[#081020]",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-sky-300/15",
    button: "bg-sky-400 text-white hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-sky-300/15",
    inputBg: "bg-white/8",
    wrapper: "",
    glow: "shadow-[0_0_25px_rgba(56,189,248,0.3)]",
  },
  lavender: {
    bg: "bg-gradient-to-br from-[#120a1e] via-[#1e1035] to-[#0e0818]",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-purple-300/15",
    button: "bg-purple-400 text-white hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-purple-300/15",
    inputBg: "bg-white/8",
    wrapper: "",
    glow: "shadow-[0_0_25px_rgba(192,132,252,0.3)]",
  },
  peach: {
    bg: "bg-gradient-to-br from-[#1a1008] via-[#2d1a0a] to-[#140e06]",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-orange-300/15",
    button: "bg-orange-400 text-white hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-orange-300/15",
    inputBg: "bg-white/8",
    wrapper: "",
    glow: "shadow-[0_0_25px_rgba(251,146,60,0.3)]",
  },
  glitter: {
    bg: "bg-black",
    text: "text-white",
    card: "bg-white/5 backdrop-blur-xl border-white/10",
    button: "bg-white text-black hover:scale-[1.02] active:scale-[0.98]",
    muted: "text-white/65",
    muted2: "text-white/45",
    border: "border-white/10",
    inputBg: "bg-white/10",
    wrapper: "bg-black/70 backdrop-blur-[6px]",
    glow: "shadow-[0_0_25px_rgba(255,255,255,0.2)]",
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
export const ARMY_PACK_PRICE_LABEL = "$2.99";
export const IMHER_PACK_PRICE_LABEL = "$4.99";
