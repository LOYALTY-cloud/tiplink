/**
 * Password strength policy — shared by signup, login, and reset flows.
 */

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "1234567890", "qwerty123",
  "password1", "iloveyou", "sunshine1", "princess1", "football1",
  "charlie1", "trustno1", "superman1", "whatever1", "welcome1",
  "monkey123", "dragon12", "master12", "letmein12", "baseball1",
  "shadow12", "michael1", "jennifer1", "abcdefgh", "password123",
  "qwertyui", "asdfghjk", "zxcvbnm1", "11111111", "00000000",
  "12341234", "abc12345", "pass1234", "admin123", "welcome123",
  "changeme", "p@ssw0rd", "passw0rd",
]);

export type PasswordError = string | null;

/**
 * Validate password strength.
 * Returns null if ok, or a user-friendly error string.
 */
export function validatePassword(password: string): PasswordError {
  if (!password || typeof password !== "string") {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must be 128 characters or less";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include a number";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Choose something stronger.";
  }
  return null;
}
