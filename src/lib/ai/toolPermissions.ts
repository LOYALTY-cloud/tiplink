/**
 * Tool Permission and Risk Model
 * Layer 2 & 3 of the AI security system
 */

export type RiskLevel = "low" | "medium" | "high";

export type ToolPermission = {
  role: string[];
  risk: RiskLevel;
  supportsSimulation?: boolean;
};

export type ToolSecurityPolicy = {
  name: string;
  description: string;
  permissions: ToolPermission;
};

/**
 * Tool risk levels:
 * - low: Read-only, auto-execute (no confirmation needed)
 * - medium: Read/light modifications, requires confirmation
 * - high: Sensitive operations, requires confirmation + re-auth
 */
export const TOOL_SECURITY_POLICIES: Record<string, ToolSecurityPolicy> = {
  getCriticalAlerts: {
    name: "getCriticalAlerts",
    description: "Get active critical admin alerts",
    permissions: {
      role: ["owner", "super_admin"],
      risk: "low",
    },
  },
  getTodaySummary: {
    name: "getTodaySummary",
    description: "Get today's activity summary",
    permissions: {
      role: ["owner", "super_admin"],
      risk: "low",
    },
  },
  getAdminActivity: {
    name: "getAdminActivity",
    description: "Get specific admin activity",
    permissions: {
      role: ["owner", "super_admin"],
      risk: "low",
    },
  },
  getOwnerApprovals: {
    name: "getOwnerApprovals",
    description: "Get pending approval queue",
    permissions: {
      role: ["owner"],
      risk: "low",
    },
  },
  getFinancialInsights: {
    name: "getFinancialInsights",
    description: "Get financial insights and metrics",
    permissions: {
      role: ["owner", "super_admin"],
      risk: "low",
    },
  },
  retryFailedPayments: {
    name: "retryFailedPayments",
    description: "Retry failed transactions from the last 24 hours",
    permissions: {
      role: ["owner"],
      risk: "high",
      supportsSimulation: true,
    },
  },
};

export function getToolPolicy(name: string): ToolSecurityPolicy | null {
  return TOOL_SECURITY_POLICIES[name] ?? null;
}

export function canRoleAccessTool(role: string, toolName: string): boolean {
  const policy = getToolPolicy(toolName);
  if (!policy) return false;
  return policy.permissions.role.includes(role);
}

export function getRiskLevel(toolName: string): RiskLevel {
  const policy = getToolPolicy(toolName);
  return policy?.permissions.risk ?? "high"; // Default to high if unknown
}

export function toolSupportsSimulation(toolName: string): boolean {
  const policy = getToolPolicy(toolName);
  return policy?.permissions.supportsSimulation === true;
}
