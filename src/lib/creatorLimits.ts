export type CreatorLimits = {
  themes: number;    // max saved themes (Infinity = unlimited)
  promoCodes: number; // max active promo codes (Infinity = unlimited)
  videoUploadsPerHour: number; // max video uploads per rolling hour window
};

export function getCreatorLimits(_tier?: string | null): CreatorLimits {
  return { themes: Infinity, promoCodes: Infinity, videoUploadsPerHour: Infinity };
}
