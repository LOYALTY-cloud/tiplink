import { NextResponse } from "next/server";
import { triggerAIAlerts } from "@/lib/ai/alerts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use triggerAIAlerts (not runAIAlerts directly) so the cooldown gate
    // prevents duplicate alerts when the cron fires every 10 minutes.
    await triggerAIAlerts("cron_scheduled");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cron/ai-alerts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
