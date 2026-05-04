/**
 * Seed realistic support tickets for /admin/tickets testing.
 * Run: node seed-tickets.cjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */
const { createClient } = require("@supabase/supabase-js");

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // ── Get real users from DB ──
  const { data: profiles, error: pErr } = await c
    .from("profiles")
    .select("user_id, handle, display_name")
    .limit(5);

  if (pErr || !profiles?.length) {
    console.error("No profiles found:", pErr?.message);
    process.exit(1);
  }

  const uid = (i) => profiles[Math.min(i, profiles.length - 1)].user_id;

  // ── Get an admin for assignment ──
  const { data: admins } = await c
    .from("profiles")
    .select("user_id")
    .in("role", ["owner", "super_admin", "support_admin"])
    .limit(1);

  const adminId = admins?.[0]?.user_id ?? null;

  // ── Clean previous test tickets ──
  await c.from("support_ticket_messages").delete().like("message", "%[TEST-SEED]%");
  const { data: oldTickets } = await c
    .from("support_tickets")
    .select("id")
    .like("subject", "%[TEST]%");

  if (oldTickets?.length) {
    const oldIds = oldTickets.map((t) => t.id);
    await c.from("support_ticket_messages").delete().in("ticket_id", oldIds);
    await c.from("support_tickets").delete().in("id", oldIds);
    console.log(`Cleaned ${oldIds.length} old test tickets`);
  }

  // ── Timestamps ──
  const now = new Date();
  const ago = (mins) => new Date(now.getTime() - mins * 60_000).toISOString();
  const ahead = (mins) => new Date(now.getTime() + mins * 60_000).toISOString();

  // ── Insert tickets ──
  const tickets = [
    // 1. Critical — payment stuck, open, SLA breaching
    {
      user_id: uid(0),
      subject: "[TEST] Payment stuck — $200 tip not showing",
      category: "payments",
      message: "I sent a $200 tip two days ago and it still hasn't arrived in my wallet. The payment was confirmed by Stripe. This is really frustrating.",
      status: "open",
      priority: 3,
      assigned_admin_id: null,
      waiting_on: "admin",
      sla_response_deadline: ago(30), // SLA already breached
      sla_resolve_deadline: ago(10),
      breach_notified: true,
      breach_count: 2,
      source: "web",
      created_at: ago(2880), // 2 days ago
      updated_at: ago(5),
    },
    // 2. High — account frozen, in-progress, assigned
    {
      user_id: uid(1),
      subject: "[TEST] Account frozen — can't withdraw",
      category: "account",
      message: "My account has been frozen and I can't access my earnings. I haven't violated any terms. Please help immediately.",
      status: "in_progress",
      priority: 2,
      assigned_admin_id: adminId,
      waiting_on: "admin",
      sla_response_deadline: ahead(60),
      sla_resolve_deadline: ahead(480),
      first_response_at: ago(120),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(180), // 3h ago
      updated_at: ago(15),
    },
    // 3. Medium — payout delay, in-progress, waiting on user
    {
      user_id: uid(2),
      subject: "[TEST] Payout delayed over 5 business days",
      category: "payouts",
      message: "My weekly payout was supposed to arrive last Tuesday. It's now been 5 business days and nothing in my bank.",
      status: "in_progress",
      priority: 1,
      assigned_admin_id: adminId,
      waiting_on: "user",
      sla_response_deadline: ahead(120),
      sla_resolve_deadline: ahead(720),
      first_response_at: ago(600),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(1440), // 1 day ago
      updated_at: ago(360),
    },
    // 4. Normal — profile question, open, unassigned
    {
      user_id: uid(0),
      subject: "[TEST] How do I change my display name?",
      category: "profile",
      message: "I want to change my public display name but I can't find where to do it. Can you help?",
      status: "open",
      priority: 0,
      assigned_admin_id: null,
      waiting_on: "admin",
      sla_response_deadline: ahead(240),
      sla_resolve_deadline: ahead(1440),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(45), // 45min ago
      updated_at: ago(45),
    },
    // 5. Critical — fraud report, open
    {
      user_id: uid(1),
      subject: "[TEST] Unauthorized tips from my card",
      category: "fraud",
      message: "Someone is using my card to send tips to unknown accounts. I see 3 charges I did not authorize totaling $450. PLEASE FREEZE THIS IMMEDIATELY.",
      status: "open",
      priority: 3,
      assigned_admin_id: null,
      waiting_on: "admin",
      sla_response_deadline: ahead(15),
      sla_resolve_deadline: ahead(60),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(8), // 8min ago
      updated_at: ago(8),
    },
    // 6. High — Stripe connect issue, in-progress
    {
      user_id: uid(3),
      subject: "[TEST] Stripe Connect verification failing",
      category: "payments",
      message: "I've tried to complete Stripe identity verification 3 times. It keeps saying 'document unreadable' but my ID is crystal clear. I can't receive payouts until this is done.",
      status: "in_progress",
      priority: 2,
      assigned_admin_id: adminId,
      waiting_on: "admin",
      sla_response_deadline: ahead(90),
      sla_resolve_deadline: ahead(480),
      first_response_at: ago(60),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(240), // 4h ago
      updated_at: ago(30),
    },
    // 7. Resolved ticket
    {
      user_id: uid(2),
      subject: "[TEST] Tip amount shows wrong on receipt",
      category: "tips",
      message: "The receipt for my last tip shows $10 but I tipped $15. Can you check?",
      status: "resolved",
      priority: 0,
      assigned_admin_id: adminId,
      waiting_on: null,
      sla_response_deadline: null,
      sla_resolve_deadline: null,
      first_response_at: ago(4320),
      resolved_at: ago(4200),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(4680), // 3.25 days ago
      updated_at: ago(4200),
    },
    // 8. Closed ticket
    {
      user_id: uid(4),
      subject: "[TEST] Can I delete my account?",
      category: "account",
      message: "I'd like to permanently delete my account and all data. How do I do this?",
      status: "closed",
      priority: 0,
      assigned_admin_id: adminId,
      waiting_on: null,
      sla_response_deadline: null,
      sla_resolve_deadline: null,
      first_response_at: ago(10080),
      resolved_at: ago(10000),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(10200), // ~7 days ago
      updated_at: ago(10000),
    },
    // 9. Medium — live chat escalation
    {
      user_id: uid(3),
      subject: "[TEST] Escalated from live chat — tip not received",
      category: "tips",
      message: "Someone said they tipped me $50 and showed me proof but it never appeared in my account.",
      status: "open",
      priority: 1,
      assigned_admin_id: null,
      waiting_on: "admin",
      sla_response_deadline: ahead(60),
      sla_resolve_deadline: ahead(480),
      breach_notified: false,
      breach_count: 0,
      source: "chat",
      source_session_id: "chat-escalation-test-001",
      created_at: ago(25), // 25min ago
      updated_at: ago(25),
    },
    // 10. High — repeat complainer, SLA close to breach
    {
      user_id: uid(0),
      subject: "[TEST] Still waiting on refund from last week",
      category: "refunds",
      message: "I was told my refund would be processed in 3-5 days. It's been 8 days. This is the third time I'm following up.",
      status: "in_progress",
      priority: 2,
      assigned_admin_id: adminId,
      waiting_on: "admin",
      sla_response_deadline: ahead(5), // almost breaching
      sla_resolve_deadline: ahead(30),
      first_response_at: ago(1440),
      breach_notified: false,
      breach_count: 0,
      source: "web",
      created_at: ago(11520), // 8 days ago
      updated_at: ago(120),
    },
  ];

  const { data: inserted, error: iErr } = await c
    .from("support_tickets")
    .insert(tickets)
    .select("id, subject, status, priority");

  if (iErr) {
    console.error("Insert error:", iErr.message);
    process.exit(1);
  }

  console.log(`✅ Seeded ${inserted.length} tickets:\n`);
  inserted.forEach((t, i) => {
    const pri = ["—", "MED", "HIGH", "CRIT"][t.priority];
    console.log(`  ${i + 1}. [${t.status.toUpperCase().padEnd(11)}] ${pri ? `(${pri}) ` : ""}${t.subject}`);
  });

  // ── Add conversation messages to some tickets ──
  const messages = [];
  const bySubject = (sub) => inserted.find((t) => t.subject.includes(sub));

  // Ticket 2: Account frozen — back and forth
  const t2 = bySubject("Account frozen");
  if (t2) {
    messages.push(
      { ticket_id: t2.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] Hi! I can see your account was flagged by our automated risk system. Let me look into this right away.", created_at: ago(120) },
      { ticket_id: t2.id, sender_type: "user", message: "[TEST-SEED] Thank you — I really need access to my funds. I have bills to pay.", created_at: ago(90) },
      { ticket_id: t2.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] I've escalated this to our risk team. The flag appears to be a false positive — your account activity looks clean.", created_at: ago(60) },
      { ticket_id: t2.id, sender_type: "system", message: "[TEST-SEED] Auto-note: Risk review requested by admin.", is_internal: true, created_at: ago(59) }
    );
  }

  // Ticket 3: Payout delayed — admin asked for details
  const t3 = bySubject("Payout delayed");
  if (t3) {
    messages.push(
      { ticket_id: t3.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] Could you confirm the last 4 digits of the bank account linked to your payouts? I want to make sure we're looking at the right account.", created_at: ago(600) },
      { ticket_id: t3.id, sender_type: "user", message: "[TEST-SEED] Sure, it ends in 4829.", created_at: ago(500) },
      { ticket_id: t3.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] Thanks! I can see the payout was initiated but the bank returned it as 'account not found'. Can you double-check your routing number in Settings → Payouts?", created_at: ago(400) }
    );
  }

  // Ticket 6: Stripe connect — one reply
  const t6 = bySubject("Stripe Connect");
  if (t6) {
    messages.push(
      { ticket_id: t6.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] I've reset your Stripe verification. Please try again — make sure the photo is well-lit and all 4 corners of the ID are visible.", created_at: ago(60) }
    );
  }

  // Ticket 7: Resolved — full conversation
  const t7 = bySubject("Tip amount shows wrong");
  if (t7) {
    messages.push(
      { ticket_id: t7.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] I checked the transaction and it looks like the tipper sent $10. The $15 may have been a different tip. Let me verify.", created_at: ago(4320) },
      { ticket_id: t7.id, sender_type: "user", message: "[TEST-SEED] Oh wait, you're right — I confused it with another tip. Sorry about that!", created_at: ago(4260) },
      { ticket_id: t7.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] No worries at all! I'll mark this as resolved. Reach out anytime if you need help.", created_at: ago(4200) }
    );
  }

  // Ticket 10: Repeat complainer
  const t10 = bySubject("Still waiting on refund");
  if (t10) {
    messages.push(
      { ticket_id: t10.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] I sincerely apologize for the delay. I've escalated your refund to our finance team for priority processing.", created_at: ago(1440) },
      { ticket_id: t10.id, sender_type: "user", message: "[TEST-SEED] This is unacceptable. I've been patient for over a week. If this isn't resolved today I'm filing a complaint.", created_at: ago(720) },
      { ticket_id: t10.id, sender_type: "admin", sender_name: "Admin", message: "[TEST-SEED] I completely understand your frustration. I've confirmed with finance that your refund of $35.00 is being processed today.", created_at: ago(120) },
      { ticket_id: t10.id, sender_type: "system", message: "[TEST-SEED] Auto-note: User has contacted support 3 times about this issue.", is_internal: true, created_at: ago(119) }
    );
  }

  if (messages.length) {
    const { error: mErr } = await c.from("support_ticket_messages").insert(messages);
    if (mErr) console.error("Message insert error:", mErr.message);
    else console.log(`\n✅ Seeded ${messages.length} conversation messages across ${new Set(messages.map(m => m.ticket_id)).size} tickets`);
  }

  console.log("\n🎯 View at: /admin/tickets");
}

main().catch(console.error);
