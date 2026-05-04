export const THEME_VIDEO_RULES = {
  targetDurationSeconds: 8,
  maxUploadDurationSeconds: 300,
  hardMaxDurationSeconds: 12,
  targetMaxBytes: 5 * 1024 * 1024,
  maxInputBytes: 200 * 1024 * 1024,   // raw upload limit before compression
  hardMaxBytes: 10 * 1024 * 1024,     // post-compression output limit
  minLongestEdgePx: 720,
  maxLongestEdgePx: 1920,
  allowedMimeTypes: ["video/mp4", "video/webm"] as const,
} as const;

export type ThemeVideoMimeType = (typeof THEME_VIDEO_RULES.allowedMimeTypes)[number];
