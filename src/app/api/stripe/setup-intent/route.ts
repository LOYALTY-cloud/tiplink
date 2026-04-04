import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  // Authenticate caller
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
  const { data: authRes, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !authRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const si = await stripe.setupIntents.create({
    payment_method_types: ["card"],
    usage: "off_session",
  });

  return NextResponse.json({ clientSecret: si.client_secret });
}
