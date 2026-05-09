import { NextResponse } from "next/server";
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

    // Verify password by attempting sign in
    const { error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
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
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(newEmail);
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
