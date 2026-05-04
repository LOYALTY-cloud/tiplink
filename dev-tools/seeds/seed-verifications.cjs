const { createClient } = require("@supabase/supabase-js");
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Get real user profiles to attach verifications to
  const { data: profiles, error: pErr } = await c.from("profiles").select("user_id, handle, display_name, full_name, dob").limit(5);
  if (pErr || !profiles?.length) { console.error("No profiles found:", pErr?.message); return; }

  console.log(`Found ${profiles.length} profiles to seed verifications for\n`);

  // Clean up any previous test verifications
  const userIds = profiles.map(p => p.user_id);
  await c.from("identity_verifications").delete().in("user_id", userIds);
  console.log("Cleaned up previous test verifications");

  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  const verifications = [];

  // 1. Pending — high match score (recommended approve)
  if (profiles[0]) {
    verifications.push({
      user_id: profiles[0].user_id,
      status: "pending",
      document_url: "verifications/test-front-1.jpg",
      document_back_url: "verifications/test-back-1.jpg",
      document_path: "verifications/test-front-1.jpg",
      document_back_path: "verifications/test-back-1.jpg",
      document_type: "driver_license",
      submitted_at: daysAgo(1),
      ocr_data: { full_name: profiles[0].display_name || "John Doe", date_of_birth: "1992-05-14", id_number: "D1234567" },
      match_score: 92,
      is_active: true,
    });
  }

  // 2. Pending — partial match (needs review)
  if (profiles[1]) {
    verifications.push({
      user_id: profiles[1].user_id,
      status: "pending",
      document_url: "verifications/test-front-2.jpg",
      document_back_url: null,
      document_path: "verifications/test-front-2.jpg",
      document_back_path: null,
      document_type: "passport",
      submitted_at: daysAgo(2),
      ocr_data: { full_name: "J. Smith", date_of_birth: "1988-11-22" },
      match_score: 61,
      is_active: true,
    });
  }

  // 3. Pending — low match (risky)
  if (profiles[2]) {
    verifications.push({
      user_id: profiles[2].user_id,
      status: "pending",
      document_url: "verifications/test-front-3.jpg",
      document_back_url: "verifications/test-back-3.jpg",
      document_path: "verifications/test-front-3.jpg",
      document_back_path: "verifications/test-back-3.jpg",
      document_type: "id_card",
      submitted_at: daysAgo(0),
      ocr_data: { full_name: "Unknown Person", error: null },
      match_score: 28,
      is_active: true,
    });
  }

  // 4. Pending — OCR failed
  if (profiles.length > 3) {
    verifications.push({
      user_id: profiles[3].user_id,
      status: "pending",
      document_url: "verifications/test-front-4.jpg",
      document_back_url: null,
      document_path: "verifications/test-front-4.jpg",
      document_back_path: null,
      document_type: "id_card",
      submitted_at: daysAgo(3),
      ocr_data: { error: "Image too blurry to extract text" },
      match_score: null,
      is_active: true,
    });
  }

  // 5. Approved — historical (shows in Approved tab)
  if (profiles[0]) {
    verifications.push({
      user_id: profiles[0].user_id,
      status: "approved",
      document_url: "verifications/test-approved-front.jpg",
      document_back_url: "verifications/test-approved-back.jpg",
      document_path: "verifications/test-approved-front.jpg",
      document_back_path: "verifications/test-approved-back.jpg",
      document_type: "driver_license",
      submitted_at: daysAgo(30),
      reviewed_at: daysAgo(28),
      reviewed_by: profiles[0].user_id,
      ocr_data: { full_name: profiles[0].display_name || "John Doe", date_of_birth: "1992-05-14", id_number: "D1234567" },
      match_score: 95,
      is_active: false,
    });
  }

  // 6. Rejected — shows in Rejected tab with reason
  if (profiles[1]) {
    verifications.push({
      user_id: profiles[1].user_id,
      status: "rejected",
      document_url: "verifications/test-rejected-front.jpg",
      document_back_url: null,
      document_path: "verifications/test-rejected-front.jpg",
      document_back_path: null,
      document_type: "passport",
      submitted_at: daysAgo(14),
      reviewed_at: daysAgo(13),
      reviewed_by: profiles[0].user_id,
      rejection_reason: "Document appears expired. The expiration date on the passport is 2023-01-15, which is over 3 years ago. Please submit a valid, non-expired document.",
      ocr_data: { full_name: "James Smith", date_of_birth: "1988-11-22", id_number: "P9876543" },
      match_score: 74,
      is_active: false,
    });
  }

  // 7. Rejected — low match with rejection
  if (profiles.length > 3) {
    verifications.push({
      user_id: profiles[3].user_id,
      status: "rejected",
      document_url: "verifications/test-rejected-2.jpg",
      document_back_url: "verifications/test-rejected-2-back.jpg",
      document_path: "verifications/test-rejected-2.jpg",
      document_back_path: "verifications/test-rejected-2-back.jpg",
      document_type: "id_card",
      submitted_at: daysAgo(7),
      reviewed_at: daysAgo(6),
      reviewed_by: profiles[0].user_id,
      rejection_reason: "Name on document does not match account holder name. The ID shows 'Robert Johnson' but the account is registered as 'Mike Chen'.",
      ocr_data: { full_name: "Robert Johnson", date_of_birth: "1995-03-08", id_number: "ID5551234" },
      match_score: 12,
      is_active: false,
    });
  }

  const { data, error } = await c.from("identity_verifications").insert(verifications).select("id, user_id, status, document_type, match_score");
  if (error) {
    console.error("Insert error:", error.message);
    return;
  }

  console.log(`\nSeeded ${data.length} verifications:\n`);
  for (const v of data) {
    const p = profiles.find(p => p.user_id === v.user_id);
    console.log(`  ${v.status.padEnd(8)} | ${(v.document_type || "").padEnd(14)} | score: ${String(v.match_score ?? "N/A").padStart(3)} | ${p?.handle || p?.display_name || v.user_id.slice(0, 8)}`);
  }

  // Update kyc_status on profiles to match
  for (const v of verifications) {
    if (v.status === "pending") {
      await c.from("profiles").update({ kyc_status: "pending" }).eq("user_id", v.user_id);
    }
  }
  console.log("\nUpdated profile kyc_status for pending verifications");
  console.log("Done! Visit /admin/verifications to see the data.");
}

main();
