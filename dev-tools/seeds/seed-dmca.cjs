const { createClient } = require("@supabase/supabase-js");

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Clean up previous test data
  const { error: delErr } = await c
    .from("dmca_reports")
    .delete()
    .like("email", "%@test-dmca.dev");
  if (delErr) console.warn("Cleanup warning:", delErr.message);

  const now = new Date();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

  const reports = [
    // 1 — Pending, high priority (theme theft)
    {
      first_name: "Taylor",
      last_name: "Nguyen",
      organization: "TN Creative Studio",
      email: "taylor@test-dmca.dev",
      phone: "+1 (404) 555-0181",
      copyrighted_work:
        "Original 'Neon Horizon' profile theme I published on my Gumroad store in January 2026. Includes custom gradient animations and unique glassmorphic card layout.",
      original_content_url: "https://gumroad.com/l/neon-horizon-theme",
      infringing_content_url: "https://1nelink.com/u/copycat_designer",
      infringement_details:
        "The user at copycat_designer is selling an exact copy of my Neon Horizon theme in the 1neLink marketplace under the name 'Galaxy Pulse'. The CSS animations, color tokens, and card layout are identical to my original work. They have made at least 12 sales of my stolen theme.",
      evidence_urls: [],
      electronic_signature: "Taylor Nguyen",
      status: "pending",
      priority: "high",
      created_at: daysAgo(1),
    },
    // 2 — Pending, normal priority (logo/branding)
    {
      first_name: "Marcus",
      last_name: "Webb",
      email: "marcus@test-dmca.dev",
      copyrighted_work:
        "Logo and brand identity for 'Webb Beats' — registered trademark, original artwork created by professional designer commissioned in 2024.",
      original_content_url: "https://webbbeats.com/brand",
      infringing_content_url: "https://1nelink.com/u/webb_beats_fake",
      infringement_details:
        "An impersonation account is using my exact logo and branding on 1neLink and collecting tips from my fans under my identity. This is causing direct financial harm.",
      evidence_urls: [],
      electronic_signature: "Marcus Webb",
      status: "pending",
      priority: "urgent",
      created_at: daysAgo(0.5),
    },
    // 3 — Reviewing, normal priority
    {
      first_name: "Priya",
      last_name: "Sharma",
      organization: "Sharma Digital Arts",
      email: "priya@test-dmca.dev",
      copyrighted_work:
        "Digital illustration series 'Urban Bloom' — 24 original artworks registered with the US Copyright Office (Registration No. VAu-1-234-567).",
      infringing_content_url: "https://1nelink.com/u/artthief99",
      infringement_details:
        "Three of my Urban Bloom illustrations are being used as profile and banner images without permission or attribution.",
      evidence_urls: [],
      electronic_signature: "Priya Sharma",
      status: "reviewing",
      priority: "normal",
      moderator_notes: "Reached out to account holder. Awaiting response. Images confirmed to match complainant's portfolio.",
      created_at: daysAgo(5),
      reviewed_at: daysAgo(3),
    },
    // 4 — Resolved (takedown complete)
    {
      first_name: "Jordan",
      last_name: "Kim",
      email: "jordan@test-dmca.dev",
      copyrighted_work:
        "Original music track 'Midnight Drive' released on SoundCloud and Spotify under JK Music (ISRC US-AB1-26-00123).",
      infringing_content_url: "https://1nelink.com/u/audio_stealer",
      infringement_details:
        "My track is being used without license in promotional videos linked from this profile.",
      evidence_urls: [],
      electronic_signature: "Jordan Kim",
      status: "resolved",
      priority: "normal",
      moderator_notes: "Verified infringement. Content removed and account warned. Complainant notified.",
      created_at: daysAgo(14),
      reviewed_at: daysAgo(10),
    },
    // 5 — Rejected (insufficient evidence)
    {
      first_name: "Alex",
      last_name: "Torres",
      email: "alex@test-dmca.dev",
      copyrighted_work:
        "Generic blue gradient background I use on my website.",
      infringing_content_url: "https://1nelink.com/u/blue_vibes",
      infringement_details:
        "This person has a blue gradient on their profile which looks similar to mine.",
      evidence_urls: [],
      electronic_signature: "Alex Torres",
      status: "rejected",
      priority: "low",
      moderator_notes: "Claim rejected. Generic color gradients are not copyrightable. No substantial similarity to original protectable expression.",
      created_at: daysAgo(8),
      reviewed_at: daysAgo(6),
    },
    // 6 — Pending, low priority
    {
      first_name: "Samira",
      last_name: "Okonkwo",
      email: "samira@test-dmca.dev",
      copyrighted_work:
        "Written bio text and creator description from my official website samiraokonkwo.com.",
      infringing_content_url: "https://1nelink.com/u/fake_samira",
      infringement_details:
        "This profile has copy-pasted my entire biography word for word including personal details about my creative journey.",
      evidence_urls: [],
      electronic_signature: "Samira Okonkwo",
      status: "pending",
      priority: "normal",
      created_at: daysAgo(2),
    },
  ];

  const { data, error } = await c
    .from("dmca_reports")
    .insert(reports)
    .select("id, first_name, last_name, status, priority");

  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${data.length} DMCA reports:`);
  data.forEach((r) =>
    console.log(`  [${r.status.toUpperCase()}] [${r.priority}] ${r.first_name} ${r.last_name} — ${r.id}`)
  );
}

main();
