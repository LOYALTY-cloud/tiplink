import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { amount, period, duration, startDate } = body;

  if (!amount || !period || !duration || !startDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Delete any existing active goal first
  await supabaseAdmin
    .from("goals")
    .delete()
    .eq("user_id", user.id)
    .eq("is_completed", false);

  const { data, error } = await supabaseAdmin.from("goals").insert({
    user_id: user.id,
    amount,
    period,
    duration,
    start_date: startDate,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    goal: {
      id: data.id,
      amount: Number(data.amount),
      period: data.period,
      duration: data.duration,
      startDate: data.start_date,
    },
  });
}
