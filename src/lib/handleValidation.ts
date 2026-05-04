/**
 * Handle Validation System
 * Production-grade handle validation: reserved words, offensive filter, suggestions.
 */

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

// ── Reserved handles (system/brand protection) ──────────────────────────
const RESERVED_HANDLES = new Set([
  // System
  "admin", "administrator", "api", "app", "auth", "billing", "bot",
  "dashboard", "dev", "error", "help", "home", "info", "login",
  "logout", "mail", "mod", "moderator", "null", "official",
  "postmaster", "root", "security", "settings", "signup", "staff",
  "support", "sysadmin", "system", "test", "undefined", "webmaster",
  // Brand
  "1nelink", "onelink", "tiplink", "tiplinkapp",
  // Generic valuable
  "about", "account", "blog", "contact", "faq", "feedback", "news",
  "press", "privacy", "status", "terms", "tos", "verify",
]);

// ── Offensive word filter ───────────────────────────────────────────────
// Normalized (letters only) patterns to catch l33t-speak and separators
const BLOCKED_PATTERNS = [
  "fuck", "shit", "bitch", "nigga", "nigger", "rape", "rapist",
  "faggot", "cunt", "dick", "pussy", "asshole", "retard",
  "whore", "slut", "nazi", "hitler", "kkk", "jihad",
];

/** Strip non-alpha to catch f_u_c_k, f.u.c.k, etc. */
function stripNonAlpha(s: string): string {
  return s.replace(/[^a-z]/g, "");
}

// ── Core validation ─────────────────────────────────────────────────────

export type HandleValidationResult =
  | { ok: true; handle: string }
  | { ok: false; error: string; code: "format" | "reserved" | "blocked" };

/**
 * Validates a handle for format, reserved words, and offensive content.
 * Does NOT check uniqueness (that requires a DB call).
 */
export function validateHandle(input: string): HandleValidationResult {
  const clean = input.trim().toLowerCase().replace(/\s+/g, "");

  if (!HANDLE_RE.test(clean)) {
    return {
      ok: false,
      error: "Handle must be 3–30 characters: letters, numbers, underscores only",
      code: "format",
    };
  }

  if (RESERVED_HANDLES.has(clean)) {
    return { ok: false, error: "This handle is reserved", code: "reserved" };
  }

  const normalized = stripNonAlpha(clean);
  const blocked = BLOCKED_PATTERNS.find((w) => normalized.includes(w));
  if (blocked) {
    return { ok: false, error: "This handle is not allowed", code: "blocked" };
  }

  return { ok: true, handle: clean };
}

// ── Suggestions ─────────────────────────────────────────────────────────

/**
 * Generate handle suggestions when the requested one is taken.
 * Returns ~8 unique candidates derived from the base handle.
 */
export function generateHandleSuggestions(base: string): string[] {
  const clean = base.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!clean) return [];

  const rand = Math.floor(Math.random() * 9999);
  const year = new Date().getFullYear().toString().slice(-2);

  const raw = [
    `${clean}1`,
    `${clean}_`,
    `${clean}x`,
    `${clean}${year}`,
    `real${clean}`,
    `the${clean}`,
    `${clean}official`,
    `${clean}${rand}`,
  ];

  // Filter to valid handles only, dedupe, cap at 8
  return [...new Set(raw)]
    .filter((s) => HANDLE_RE.test(s) && !RESERVED_HANDLES.has(s))
    .slice(0, 8);
}

export { HANDLE_RE, RESERVED_HANDLES };
