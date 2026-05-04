export type OwnerAiTool = "critical_alerts" | "today_summary" | "admin_activity" | "owner_approvals" | "financial_insights" | "help";

export type OwnerAiIntent = {
  tool: OwnerAiTool;
  adminId?: string;
};

export const OWNER_AI_HELP_REPLY = "Try: 'show critical alerts', 'today summary', 'owner approvals', 'financial today', 'activity for admin <id>', or 'retry failed payments'.";

export function extractFinancialRange(message: string): "today" | "7d" | "30d" {
  const text = message.toLowerCase();
  if (text.includes("30d") || text.includes("30 day") || text.includes("month")) return "30d";
  if (text.includes("7d") || text.includes("7 day") || text.includes("week")) return "7d";
  return "today";
}

export function extractAdminId(message: string): string | null {
  const patterns = [
    /activity\s+for\s+admin\s+([a-z0-9_-]{3,64})/i,
    /admin\s+([a-z0-9_-]{3,64}).*(activity|actions|log)/i,
    /(activity|actions|log).*(admin_id|admin)\s*[:#-]?\s*([a-z0-9_-]{3,64})/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const candidate = match[3] ?? match[1];
    if (candidate) return candidate;
  }

  return null;
}

export function detectOwnerAiIntent(message: string): OwnerAiIntent {
  const text = message.toLowerCase();

  if (
    text.includes("financial") ||
    text.includes("revenue") ||
    text.includes("processed") ||
    text.includes("withdrawn") ||
    text.includes("failed transaction") ||
    text.includes("money") ||
    text.includes("volume")
  ) {
    return { tool: "financial_insights" };
  }

  if (
    text.includes("approval") ||
    text.includes("approvals") ||
    text.includes("owner required") ||
    text.includes("needs owner")
  ) {
    return { tool: "owner_approvals" };
  }

  if (text.includes("critical") || text.includes("alert")) {
    return { tool: "critical_alerts" };
  }

  if (text.includes("today") || text.includes("summary")) {
    return { tool: "today_summary" };
  }

  const adminId = extractAdminId(message);
  if (adminId) {
    return { tool: "admin_activity", adminId };
  }

  return { tool: "help" };
}