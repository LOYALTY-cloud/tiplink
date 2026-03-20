export function getRoleBadge(role?: string | null) {
  const map: Record<string, { label: string; className: string }> = {
    owner: {
      label: "Owner",
      className: "bg-red-500/10 text-red-400 border border-red-500/20",
    },
    super_admin: {
      label: "Admin",
      className: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    },
    finance_admin: {
      label: "Finance",
      className: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
    },
    support_admin: {
      label: "Support",
      className: "bg-green-500/10 text-green-400 border border-green-500/20",
    },
    system: {
      label: "System",
      className: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    },
    user: {
      label: "User",
      className: "bg-white/5 text-white/50 border border-white/10",
    },
  };

  return map[role || "user"] || map.user;
}
