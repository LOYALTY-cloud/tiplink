export const SUPPORT_FILE_PREFIX = "support-file:";

export function encodeSupportFileRef(path: string): string {
  return `${SUPPORT_FILE_PREFIX}${path}`;
}

export function decodeSupportFileRef(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(SUPPORT_FILE_PREFIX)) return null;
  return value.slice(SUPPORT_FILE_PREFIX.length);
}

export function isSupportFileRef(value: string | null | undefined): value is string {
  return !!decodeSupportFileRef(value);
}