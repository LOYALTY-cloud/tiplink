import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .maybeSingle();

  if (!data) return NextResponse.json({ goal: null });

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
