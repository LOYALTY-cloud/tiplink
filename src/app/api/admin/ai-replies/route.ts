import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { guardOutput } from "@/lib/aiGuard";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const adminId = admin.userId;

    const { base, context } = await req.json();

    if (!Array.isArray(base) || base.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const prompt = `You refine admin support reply templates to be more helpful and specific.

Rules:
- Keep each reply to 1-2 sentences max
- Professional and empathetic tone
- Do NOT include any personal data (emails, names, IDs, payment details)
- Do NOT invent facts or make promises about timelines
- Do NOT reference internal systems or tools
- Return EXACTLY ${base.length} refined replies, one per line
- Each reply should be a complete, ready-to-send message

Ticket category: ${context?.ticket_type || "general"}
Ticket status: ${context?.status || "open"}

Original replies to refine:
${base.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}

Return only the refined replies, one per line, numbered.`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices[0]?.message?.content || "";

    // Parse numbered lines, strip numbers
    const suggestions = text
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter((line) => line.length > 10)
      .slice(0, base.length);

    // Guard each suggestion through output filter
    const safeSuggestions = suggestions.map((s) => {
      const result = guardOutput(s);
      return result.text;
    });

    return NextResponse.json({ suggestions: safeSuggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
