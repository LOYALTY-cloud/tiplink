// Owner account(s) that should always have full creator access on the user side.
const DEFAULT_OWNER_ELITE_EMAILS = ["moway44@gmail.com"];

function normalizedEmailSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean));
}

function ownerEliteEmails(): Set<string> {
  const envEmails = (process.env.OWNER_ELITE_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim());
  return normalizedEmailSet([...DEFAULT_OWNER_ELITE_EMAILS, ...envEmails]);
}

export function isOwnerEliteEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEliteEmails().has(email.trim().toLowerCase());
}

export function effectiveCreatorAccess(input: {
  email: string | null | undefined;
  isCreator: boolean;
}): { isCreator: boolean; ownerElite: boolean } {
  const ownerElite = isOwnerEliteEmail(input.email);
  return { isCreator: input.isCreator || ownerElite, ownerElite };
}