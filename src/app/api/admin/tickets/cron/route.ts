import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * POST /api/admin/tickets/cron — Cron job for:
 * 1. SLA breach detection + admin notification + priority escalation
 * 2. Auto-close warning (no user reply for 5 days)
 * 3. Auto-close execution (warning sent + no reply for 1 more day)
 *
 * Protect with CRON_SECRET header in production.
 */
export async function POST(req: Request) {
  // Strict auth: require CRON_SECRET always (Vercel sends Authorization: Bearer <secret>)
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { reminded: 0, breached: 0, reassigned: 0, nudged: 0, warned: 0, closed: 0 };

  try {
    const now = new Date().toISOString();

    // ── 0. PRE-BREACH SLA REMINDER (15 min before deadline) ──
    const fifteenMinFromNow = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Response SLA approaching
    const { data: approachingResponse } = await supabaseAdmin
      .from("support_tickets")
      .select("id, subject, assigned_admin_id, sla_response_deadline")
      .is("first_response_at", null)
      .eq("reminder_sent", false)
      .in("status", ["open"])
      .gt("sla_response_deadline", now)
      .lt("sla_response_deadline", fifteenMinFromNow);

    // Resolve SLA approaching
    const { data: approachingResolve } = await supabaseAdmin
      .from("support_tickets")
      .select("id, subject, assigned_admin_id, sla_resolve_deadline")
      .eq("reminder_sent", false)
      .in("status", ["open", "in_progress"])
      .gt("sla_resolve_deadline", now)
      .lt("sla_resolve_deadline", fifteenMinFromNow);

    const approaching = [...(approachingResponse ?? []), ...(approachingResolve ?? [])];
    const seenReminder = new Set<string>();
    const uniqueApproaching = approaching.filter((t) => {
      if (seenReminder.has(t.id)) return false;
      seenReminder.add(t.id);
      return true;
    });

    for (const ticket of uniqueApproaching) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ reminder_sent: true, updated_at: now })
        .eq("id", ticket.id);

      if (ticket.assigned_admin_id) {
        createNotification({
          userId: ticket.assigned_admin_id,
          type: "support",
          title: `⏰ SLA approaching: ${ticket.subject}`,
          body: `Ticket #${ticket.id.slice(0, 8)} SLA deadline is in ~15 minutes. Respond now to avoid a breach.`,
          meta: { ticketId: ticket.id },
        }).catch(() => {});
      }
      results.reminded++;
    }

    // ── 1. TIERED SLA BREACH ESCALATION ─────────────────
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Response SLA breaches — tickets that haven't been responded to past deadline
    const { data: responseBreach } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, priority, assigned_admin_id, breach_count, watchers, sla_response_deadline")
      .is("first_response_at", null)
      .in("status", ["open"])
      .lt("sla_response_deadline", now);

    // Resolve SLA breaches — tickets past resolve deadline
    const { data: resolveBreach } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, priority, assigned_admin_id, breach_count, watchers, sla_resolve_deadline")
      .in("status", ["open", "in_progress"])
      .lt("sla_resolve_deadline", now);

    const allBreached = [
      ...(responseBreach ?? []),
      ...(resolveBreach ?? []),
    ];

    // Deduplicate by ticket id
    const seen = new Set<string>();
    const uniqueBreached = allBreached.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // Cache admin lists so we don't query repeatedly
    let allAdminsCache: { user_id: string }[] | null = null;
    let ownersCache: { user_id: string }[] | null = null;

    for (const ticket of uniqueBreached) {
      const currentBreachCount = ticket.breach_count ?? 0;
      const newBreachCount = currentBreachCount + 1;
      const newPriority = ticket.priority >= 2 ? 3 : 2;

      await supabaseAdmin
        .from("support_tickets")
        .update({
          breach_notified: true,
          breach_count: newBreachCount,
          priority: newPriority,
          updated_at: now,
        })
        .eq("id", ticket.id);

      // ── Tier 1 (1st breach): notify assigned admin only ──
      if (newBreachCount === 1 && ticket.assigned_admin_id) {
        createNotification({
          userId: ticket.assigned_admin_id,
          type: "security",
          title: `⚠️ SLA Breach: ${ticket.subject}`,
          body: `Ticket #${ticket.id.slice(0, 8)} has breached its SLA. Priority escalated to ${newPriority === 3 ? "Critical" : "High"}.`,
          meta: { ticketId: ticket.id },
        }).catch(() => {});
      }

      // ── Tier 2 (2nd breach): notify all admins ──
      if (newBreachCount === 2) {
        if (!allAdminsCache) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .in("role", ["owner", "super_admin", "support_admin"]);
          allAdminsCache = data ?? [];
        }
        for (const admin of allAdminsCache) {
          createNotification({
            userId: admin.user_id,
            type: "security",
            title: `🔴 SLA Breach (2nd): ${ticket.subject}`,
            body: `Ticket #${ticket.id.slice(0, 8)} has breached SLA twice. Immediate attention required.`,
            meta: { ticketId: ticket.id },
          }).catch(() => {});
        }
      }

      // ── Tier 3 (3rd+ breach): notify owner + force reassign ──
      if (newBreachCount >= 3) {
        if (!ownersCache) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("role", "owner");
          ownersCache = data ?? [];
        }
        for (const owner of ownersCache) {
          createNotification({
            userId: owner.user_id,
            type: "security",
            title: `🚨 SLA Breach (${newBreachCount}x): ${ticket.subject}`,
            body: `Ticket #${ticket.id.slice(0, 8)} has breached ${newBreachCount} times. Force reassignment triggered.`,
            meta: { ticketId: ticket.id },
          }).catch(() => {});
        }

        // Force reassign to lowest-load admin (excluding current assignee)
        const { data: candidates } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .in("role", ["support_admin", "super_admin"])
          .neq("user_id", ticket.assigned_admin_id ?? "");

        if (candidates && candidates.length > 0) {
          // Count active tickets per candidate
          const { data: activeCounts } = await supabaseAdmin
            .from("support_tickets")
            .select("assigned_admin_id")
            .in("status", ["open", "in_progress"]);

          const loadMap: Record<string, number> = {};
          for (const t of activeCounts ?? []) {
            if (t.assigned_admin_id) {
              loadMap[t.assigned_admin_id] = (loadMap[t.assigned_admin_id] || 0) + 1;
            }
          }

          // Pick candidate with lowest load
          const sorted = candidates.sort(
            (a, b) => (loadMap[a.user_id] || 0) - (loadMap[b.user_id] || 0)
          );
          const newAssignee = sorted[0].user_id;

          await supabaseAdmin
            .from("support_tickets")
            .update({
              assigned_admin_id: newAssignee,
              updated_at: now,
            })
            .eq("id", ticket.id);

          await supabaseAdmin.from("support_ticket_messages").insert({
            ticket_id: ticket.id,
            sender_type: "system",
            message: `🔁 Reassigned due to SLA breach (${newBreachCount}x). Previous assignee did not respond in time.`,
          });

          results.reassigned++;
        }
      }

      // Notify watchers (if any) — deduplicate against tier recipients
      const notifiedAdmins = new Set<string>();
      if (newBreachCount === 1 && ticket.assigned_admin_id) notifiedAdmins.add(ticket.assigned_admin_id);
      if (newBreachCount === 2 && allAdminsCache) allAdminsCache.forEach((a) => notifiedAdmins.add(a.user_id));
      if (newBreachCount >= 3 && ownersCache) ownersCache.forEach((o) => notifiedAdmins.add(o.user_id));

      const watchers = (ticket.watchers as string[] | null) ?? [];
      for (const watcherId of watchers) {
        if (notifiedAdmins.has(watcherId)) continue; // already notified via tier
        createNotification({
          userId: watcherId,
          type: "security",
          title: `👁️ Watched ticket breached: ${ticket.subject}`,
          body: `Ticket #${ticket.id.slice(0, 8)} breached SLA (${newBreachCount}x).`,
          meta: { ticketId: ticket.id },
        }).catch(() => {});
      }

      results.breached++;
    }

    // ── 2. WAITING-ON-USER AUTO-NUDGE (24h + 48h) ─────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Nudge 1: 24h no user reply, nudge_count = 0
    const { data: nudge1 } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, nudge_count")
      .in("status", ["open", "in_progress"])
      .eq("waiting_on", "user")
      .eq("nudge_count", 0)
      .lt("last_user_reply_at", oneDayAgo);

    for (const ticket of nudge1 ?? []) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ nudge_count: 1, updated_at: now })
        .eq("id", ticket.id);

      createNotification({
        userId: ticket.user_id,
        type: "support",
        title: `Reminder: ${ticket.subject}`,
        body: "We're waiting for your reply. Please respond so we can continue helping you.",
        meta: { ticketId: ticket.id },
      }).catch(() => {});

      results.nudged++;
    }

    // Nudge 2: 48h no user reply, nudge_count = 1
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: nudge2 } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, nudge_count")
      .in("status", ["open", "in_progress"])
      .eq("waiting_on", "user")
      .eq("nudge_count", 1)
      .lt("last_user_reply_at", twoDaysAgo);

    for (const ticket of nudge2 ?? []) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ nudge_count: 2, updated_at: now })
        .eq("id", ticket.id);

      createNotification({
        userId: ticket.user_id,
        type: "support",
        title: `Final reminder: ${ticket.subject}`,
        body: "We still need your response. This ticket will be closed soon if we don't hear back.",
        meta: { ticketId: ticket.id },
      }).catch(() => {});

      results.nudged++;
    }

    // ── 3. AUTO-CLOSE WARNING (5 days no user reply) ────
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleTickets } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject")
      .in("status", ["open", "in_progress"])
      .eq("waiting_on", "user")
      .eq("auto_close_warning_sent", false)
      .lt("last_user_reply_at", fiveDaysAgo);

    for (const ticket of staleTickets ?? []) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ auto_close_warning_sent: true, updated_at: now })
        .eq("id", ticket.id);

      createNotification({
        userId: ticket.user_id,
        type: "support",
        title: `Action needed: ${ticket.subject}`,
        body: "We haven't heard from you in a while. This ticket will be automatically closed in 24 hours if no reply is received.",
        meta: { ticketId: ticket.id },
      }).catch(() => {});

      results.warned++;
    }

    // ── 4. AUTO-CLOSE EXECUTION (warning + 1 more day) ──
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    const { data: closeable } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject")
      .in("status", ["open", "in_progress"])
      .eq("auto_close_warning_sent", true)
      .lt("last_user_reply_at", sixDaysAgo);

    for (const ticket of closeable ?? []) {
      await supabaseAdmin
        .from("support_tickets")
        .update({ status: "closed", updated_at: now })
        .eq("id", ticket.id);

      // Insert system message
      await supabaseAdmin.from("support_ticket_messages").insert({
        ticket_id: ticket.id,
        sender_type: "system",
        message: "This ticket was automatically closed due to inactivity.",
      });

      createNotification({
        userId: ticket.user_id,
        type: "support",
        title: `Ticket closed: ${ticket.subject}`,
        body: "Your support ticket was automatically closed due to inactivity. If you still need help, please open a new ticket.",
        meta: { ticketId: ticket.id },
      }).catch(() => {});

      results.closed++;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("Ticket cron error:", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

// Vercel cron invokes GET by default
export async function GET(req: Request) {
  return POST(req);
}
