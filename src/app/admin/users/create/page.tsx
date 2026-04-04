"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ui } from "@/lib/ui";
import { getAdminHeaders } from "@/lib/auth/adminSession";

const ROLES = [
  { value: "support_admin", label: "Support Admin" },
  { value: "finance_admin", label: "Finance Admin" },
  { value: "super_admin", label: "Super Admin" },
  { value: "owner", label: "Owner" },
] as const;

type CreateResult = {
  success: boolean;
  admin_id: string;
  admin_passcode?: string;
  display_name: string;
  role: string;
};

function CreateAdminContent() {
  const router = useRouter();
  const params = useSearchParams();

  const targetUserId = params.get("userId") ?? "";
  const isAssignMode = !!targetUserId;

  const [form, setForm] = useState({
    firstName: params.get("firstName") ?? "",
    lastName: params.get("lastName") ?? "",
    role: params.get("role") && ROLES.some((r) => r.value === params.get("role")) ? params.get("role")! : "support_admin",
    email: params.get("email") ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    const headers = getAdminHeaders();
    if (!headers["X-Admin-Id"]) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/create-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ ...form, ...(targetUserId ? { targetUserId } : {}) }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to create admin");
      return;
    }

    setResult(json);
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className={ui.h1}>{isAssignMode ? "Assign Admin Role" : "Create Admin"}</h1>
        <p className={`${ui.muted} mt-1`}>
          {isAssignMode
            ? "Assign an admin role, ID, and verification email to this user."
            : "Provision a new team member with admin access."}
        </p>
      </div>

      {result ? (
        <div className={`${ui.card} p-6 space-y-4`}>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-xl">✓</span>
            <h2 className="text-white font-semibold text-lg">{isAssignMode ? "Role Assigned" : "Admin Created"}</h2>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="text-white"><strong>Name:</strong> {result.display_name}</p>
            <p className="text-white"><strong>Admin ID:</strong> <span className="font-mono text-emerald-400">{result.admin_id}</span></p>
            <p className="text-white"><strong>Passcode:</strong> <span className="font-mono text-amber-400">{result.admin_passcode}</span></p>
            <p className="text-white"><strong>Role:</strong> {result.role}</p>
            <p className={`text-xs text-amber-400/70 mt-2`}>Save the passcode — it&apos;s the login credential and won&apos;t be shown again.</p>
            <p className={`text-xs ${ui.muted2}`}>A welcome email with login instructions has been sent.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/admin/staff")}
              className="bg-emerald-500 hover:bg-emerald-600 text-black py-2 px-4 rounded-xl font-medium text-sm transition"
            >
              Go to Staff →
            </button>
            <button
              onClick={() => { setResult(null); setForm({ firstName: "", lastName: "", role: "support_admin", email: "" }); }}
              className={`${ui.btnGhost} ${ui.btnSmall}`}
            >
              Create Another
            </button>
            <button
              onClick={() => router.push("/admin/users")}
              className={`${ui.btnGhost} ${ui.btnSmall}`}
            >
              ← Back to Users
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={`${ui.card} p-6 space-y-4`}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-xs ${ui.muted2} mb-1 block`}>First Name</label>
              <input
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                placeholder="John"
                required
                className={ui.input}
              />
            </div>
            <div>
              <label className={`text-xs ${ui.muted2} mb-1 block`}>Last Name</label>
              <input
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                placeholder="Doe"
                required
                className={ui.input}
              />
            </div>
          </div>

          <div>
            <label className={`text-xs ${ui.muted2} mb-1 block`}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="john@company.com"
              required
              className={ui.input}
            />
          </div>

          <div>
            <label className={`text-xs ${ui.muted2} mb-1 block`}>Role</label>
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              className={ui.select}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value} className="bg-zinc-900 text-white">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black py-2.5 rounded-xl font-medium text-sm transition"
          >
            {loading ? (isAssignMode ? "Assigning…" : "Creating…") : (isAssignMode ? "Assign Role" : "Create Admin")}
          </button>
        </form>
      )}
    </div>
  );
}

export default function CreateAdminPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CreateAdminContent />
    </Suspense>
  );
}
