import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseRouteClient();

    // Get current user
    const { data: authUser, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authUser?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = authUser.user.id;
    const userEmail = authUser.user.email;

    // Parse request body
    const { newEmail, password } = await req.json();

    if (!newEmail || !password) {
      return NextResponse.json(
        { error: "New email and password are required" },
        { status: 400 }
      );
    }

    // Validate new email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    if (newEmail.toLowerCase() === (userEmail || "").toLowerCase()) {
      return NextResponse.json(
        { error: "New email must be different from your current email" },
        { status: 400 }
      );
    }

    // Verify password using a separate anon client so we don't mutate the current session
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: userEmail || "",
      password,
    });

    if (signInErr) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    // Check if new email is already in use
    const { data: listedUsers, error: listUsersErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listUsersErr) {
      return NextResponse.json(
        { error: "Failed to validate email availability" },
        { status: 500 }
      );
    }

    const existingUser = listedUsers.users.find(
      (user) => user.email?.toLowerCase() === newEmail.toLowerCase() && user.id !== userId
    );

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    // Update email in auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: false }
    );

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update email: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Update email in profiles table
    await supabaseAdmin
      .from("profiles")
      .update({ email: newEmail })
      .eq("user_id", userId);

    return NextResponse.json({
      success: true,
      message: "Email changed successfully. Please verify your new email address.",
      newEmail,
    });
  } catch (err) {
    console.error("Email change error:", err);
    return NextResponse.json(
      { error: "Failed to change email" },
      { status: 500 }
    );
  }
}
