import { NextResponse } from "next/server"
import { createSupabaseRouteClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimit } from "@/lib/rateLimit"

export async function POST(req: Request) {
  try {
    const { password } = await req.json()

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 })
    }

    const supabase = await createSupabaseRouteClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit: 5 attempts per 5 minutes per user
    const { allowed } = await rateLimit(`verify_pw:${user.id}`, 5, 300)
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes." },
        { status: 429 }
      )
    }

    // Use a separate client to verify password without affecting the existing session
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )

    const { error } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (error) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
