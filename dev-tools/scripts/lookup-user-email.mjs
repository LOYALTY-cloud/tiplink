import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local
const env = Object.fromEntries(
  readFileSync("/workspaces/tiplink/.env.local", "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = process.argv[2];
if (!email) { console.error("Usage: node lookup-user-email.mjs <email>"); process.exit(1); }

// Paginate through all users (listUsers maxes at 1000/page)
let user = null;
for (let page = 1; page <= 10; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error(error); process.exit(1); }
  const found = data.users.find(u => u.email === email);
  if (found) { user = found; break; }
  if (!data.users.length || data.users.length < 1000) break;
}

if (!user) {
  // Fallback: search profiles table by email column
  const { data: profByEmail } = await sb.from("profiles").select("*").eq("email", email).maybeSingle();
  if (profByEmail) {
    console.log("\nNot in auth.users but found in profiles.email:");
    console.log(JSON.stringify(profByEmail, null, 2));
  } else {
    console.log("No account found for:", email);
    // Check if it appears anywhere else (tipper, login_logs, notifications)
    const { data: loginLog } = await sb.from("login_logs").select("user_id,created_at").eq("email", email).limit(3);
    if (loginLog?.length) console.log("Found in login_logs:", loginLog);
    const { data: tipIntent } = await sb.from("tip_intents").select("*").ilike("note", `%${email}%`).limit(3);
    if (tipIntent?.length) console.log("Found in tip_intents note:", tipIntent);
  }
  process.exit(0);
}

console.log("\n── AUTH USER ──────────────────────────────────");
console.log("ID:            ", user.id);
console.log("Email:         ", user.email);
console.log("Created:       ", user.created_at);
console.log("Last sign-in:  ", user.last_sign_in_at);
console.log("Email confirmed:", user.email_confirmed_at);

const { data: profile } = await sb.from("profiles").select("id,handle,display_name,role,account_status,stripe_account_id,owed_balance,is_frozen,is_flagged").eq("user_id", user.id).maybeSingle();
console.log("\n── PROFILE ────────────────────────────────────");
console.log(JSON.stringify(profile, null, 2));

const { data: wallet } = await sb.from("wallets").select("balance,available,pending").eq("user_id", user.id).maybeSingle();
console.log("\n── WALLET ─────────────────────────────────────");
console.log(JSON.stringify(wallet, null, 2));
