/**
 * Alert: Discord webhook — sends a security alert to a Discord channel.
 * Optional: only active when SECURITY_DISCORD_WEBHOOK is set.
 */

import { securityConfig } from "../config/security-config";
import type { SecurityAlert } from "../types/security-event";
import { createLogger } from "../utils/logger";

const log = createLogger("alert-discord");

const SEVERITY_COLOR: Record<string, number> = {
  CRITICAL: 0xdc2626, // red
  HIGH:     0xf97316, // orange
  MEDIUM:   0xeab308, // yellow
  LOW:      0x3b82f6, // blue
};

export async function sendDiscordAlert(alert: SecurityAlert): Promise<void> {
  const webhookUrl = securityConfig.alerts.discordWebhook;
  if (!webhookUrl) {
    log.warn("SECURITY_DISCORD_WEBHOOK not set — skipping Discord alert");
    return;
  }

  const color = SEVERITY_COLOR[alert.severity as keyof typeof SEVERITY_COLOR] ?? 0x6b7280;
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Severity", value: alert.severity, inline: true },
    { name: "Type",     value: alert.type,     inline: true },
  ];
  if (alert.ipMasked) {
    fields.push({ name: "Source IP (masked)", value: alert.ipMasked, inline: false });
  }

  const payload = {
    embeds: [
      {
        title: `Security Alert — ${alert.type}`,
        description: alert.summary,
        color,
        fields,
        footer: { text: "1neLink Security Monitor" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.warn("Discord webhook error", { status: res.status });
    } else {
      log.info("Discord alert sent", { type: alert.type });
    }
  } catch (err) {
    log.error("Discord alert failed", { message: String(err) });
  }
}
