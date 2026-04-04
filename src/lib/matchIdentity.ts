import type { OcrResult } from "./ocr";

export type MatchResult = {
  score: number;
  level: "high" | "medium" | "low";
  details: {
    name_match: boolean;
    dob_match: boolean;
    id_present: boolean;
  };
};

/**
 * Compare OCR-extracted data from an ID document against the user's profile.
 * Returns a match score (0-100) and confidence level.
 */
export function matchIdentity(
  profile: { full_name?: string | null; display_name?: string | null; dob?: string | null },
  ocr: OcrResult
): MatchResult {
  let score = 0;

  const profileName = (profile.full_name || profile.display_name || "").toLowerCase().trim();
  const ocrName = (ocr.full_name || "").toLowerCase().trim();

  const nameMatch = !!(profileName && ocrName && profileName === ocrName);
  if (nameMatch) score += 50;

  const dobMatch = !!(ocr.date_of_birth && profile.dob && ocr.date_of_birth === profile.dob);
  if (dobMatch) score += 30;

  const idPresent = !!ocr.id_number;
  if (idPresent) score += 20;

  return {
    score,
    level: score >= 80 ? "high" : score >= 50 ? "medium" : "low",
    details: { name_match: nameMatch, dob_match: dobMatch, id_present: idPresent },
  };
}
