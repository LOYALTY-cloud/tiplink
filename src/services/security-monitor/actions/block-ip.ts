/**
 * Action: Block IP — adds a Vercel Firewall rule + records to security_blocked_ips.
 * In observe mode, records intent but does NOT call Vercel.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { securityConfig } from "../config/security-config";
import type { ActionResult } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("block-ip");

export async function blockIp(
  ip: string,
  reason: string,
  durationHours: number = 24
): Promise<ActionResult> {
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  // Record to security_blocked_ips regardless of mode
  const { error: dbError } = await supabaseAdmin
    .from("security_blocked_ips")
    .upsert(
      { ip, reason, expires_at: expiresAt, vercel_rule_id: null },
      { onConflict: "ip" }
    );

  if (dbError) {
    log.error("DB insert failed for block-ip", { message: dbError.message });
    return { type: "BLOCK_IP", target: ip, result: "FAILED", detail: dbError.message };
  }

  if (securityConfig.mode === "observe") {
    log.info(`[observe] Would block IP ${ip} — not calling Vercel`);
    return { type: "BLOCK_IP", target: ip, result: "SKIPPED", detail: "observe mode" };
  }

  const { token, teamId, projectId } = securityConfig.vercel;
  if (!token || !teamId || !projectId) {
    log.warn("Vercel credentials not set — IP recorded but not firewalled");
    return { type: "BLOCK_IP", target: ip, result: "SKIPPED", detail: "vercel credentials not configured" };
  }

  try {
    const res = await fetch(
      `https://api.vercel.com/v1/security/firewall/config?teamId=${teamId}&projectId=${projectId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: { op: "add" },
          value: {
            name: `sec-monitor-${ip}`,
            active: true,
            conditionGroup: [{ conditions: [{ type: "ip_address", op: "eq", value: ip }] }],
            action: { type: "deny" },
          },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      log.warn("Vercel Firewall PATCH failed", { status: res.status, body: body.slice(0, 200) });
      return { type: "BLOCK_IP", target: ip, result: "FAILED", detail: `Vercel API ${res.status}` };
    }

    const data = await res.json() as { id?: string };
    const ruleId = data.id ?? null;

    // Store rule ID for later cleanup
    if (ruleId) {
      await supabaseAdmin
        .from("security_blocked_ips")
        .update({ vercel_rule_id: ruleId })
        .eq("ip", ip);
    }

    log.info(`Blocked IP at Vercel firewall`, { ruleId });
    return { type: "BLOCK_IP", target: ip, result: "OK", detail: `Vercel rule ${ruleId}` };
  } catch (err) {
    log.error("Vercel block-ip failed", { message: String(err) });
    return { type: "BLOCK_IP", target: ip, result: "FAILED", detail: String(err) };
  }
}
