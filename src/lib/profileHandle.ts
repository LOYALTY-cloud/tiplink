const UUID_HANDLE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getDisplayHandle(handle: string | null | undefined): string | null {
  const normalized = handle?.trim();
  return normalized && !UUID_HANDLE_PATTERN.test(normalized) ? normalized : null;
}