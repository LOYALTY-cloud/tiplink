import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createSupabaseRouteClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { event, reason, timestamp } = await req.json()

    if (!event || !reason) {
      return NextResponse.json({ error: "event and reason required" }, { status: 400 })
    }

    // Identify the user — try cookie-based auth first, then admin header
    let userId: string | null = null
    let userType: "user" | "admin" = "user"

    const adminId = req.headers.get("x-admin-id")
    if (adminId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("admin_id", adminId)
        .maybeSingle()
      userId = profile?.user_id ?? null
      userType = "admin"
    }

    if (!userId) {
      try {
        const supabase = await createSupabaseRouteClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user?.id ?? null
      } catch {
        // Not authenticated — still log as anonymous
      }
    }

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: userId ?? "00000000-0000-0000-0000-000000000000",
      action: `session_${event}`,
      metadata: {
        reason,
        user_type: userType,
        timestamp: timestamp ?? Date.now(),
        user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
