import { THEMES, type ThemeKey, type ThemeConfig } from "./themes";

export function getTheme(theme?: string | null): ThemeConfig {
  return THEMES[(theme as ThemeKey) || "default"] || THEMES.default;
}
