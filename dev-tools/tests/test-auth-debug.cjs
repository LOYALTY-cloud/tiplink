const fs = require("fs");
const envContent = fs.readFileSync(".env.local", "utf-8");
envContent.split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.startsWith("#")) {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

async function test() {
  const r = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "loyalty.born2win@gmail.com", password: "Born2Win@2025" }),
  });
  const j = await r.json();
  console.log("Status:", r.status);
  console.log("Keys:", Object.keys(j));
  if (j.error) console.log("Error:", j.error, j.error_description || j.msg);
  if (j.access_token) console.log("Token:", j.access_token.slice(0, 30) + "...");
  
  // Also try listing user via admin
  const r2 = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/admin/users?page=1&per_page=5", {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  const j2 = await r2.json();
  if (j2.users) {
    console.log("\nUsers found:", j2.users.length);
    j2.users.forEach((u) => console.log("  -", u.email, u.id.slice(0, 8)));
  }
}
test();
