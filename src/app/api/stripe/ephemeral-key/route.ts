import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ error: "Card issuing is disabled" }, { status: 403 }); }
export async function GET() { return NextResponse.json({ error: "Card issuing is disabled" }, { status: 403 }); }
