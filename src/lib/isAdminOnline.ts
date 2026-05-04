/**
 * Production-grade admin presence check.
 * Admin is ONLY "online" if they have pinged within the last 60 seconds.
 * No heartbeat = offline. No exceptions.
 */
export function isAdminOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  return diff < 60 * 1000; // active if within last 60 seconds
}

/** Human-readable "last seen" text */
export function lastSeenText(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "Never seen";
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  if (diff < 60_000) return "Active now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  return `Last seen ${new Date(lastActiveAt).toLocaleDateString()}`;
}
