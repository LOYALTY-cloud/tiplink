import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually
const env = readFileSync("/workspaces/tiplink/.env.local", "utf8");
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
  process.env[key] = val;
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node check-stripe-connect.mjs <email>");
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: { users }, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) { console.error("listUsers error:", listErr); process.exit(1); }

const match = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!match) {
  console.log("❌ No auth user found for:", email);
  process.exit(0);
}

console.log("✅ Auth user found");
console.log("   ID:         ", match.id);
console.log("   Email:      ", match.email);
console.log("   Confirmed:  ", match.email_confirmed_at ? "yes" : "no");

const { data: profile, error: profErr } = await sb
  .from("profiles")
  .select("user_id, handle, stripe_account_id, stripe_payouts_enabled, account_status, created_at")
  .eq("user_id", match.id)
  .maybeSingle();

if (profErr) { console.error("Profile query error:", profErr); process.exit(1); }
if (!profile) { console.log("❌ No profile row found"); process.exit(0); }

console.log("\n📋 Profile:");
console.log("   Handle:               ", profile.handle ?? "(none)");
console.log("   Account status:       ", profile.account_status ?? "(none)");
console.log("   Created:              ", profile.created_at);
console.log("\n💳 Stripe Connect:");
console.log("   stripe_account_id:    ", profile.stripe_account_id ?? "❌ NOT connected");
console.log("   stripe_payouts_enabled:", profile.stripe_payouts_enabled ? "✅ yes" : "❌ no");
