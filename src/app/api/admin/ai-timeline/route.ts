import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"
import { guardOutput } from "@/lib/aiGuard"
import { rateLimit } from "@/lib/rateLimit"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const adminId = admin.userId

    const { allowed } = await rateLimit(`ai-timeline:${adminId}`, 10, 60)
    if (!allowed) {
      return NextResponse.json(
        { explanation: "Rate limited — try again shortly." },
        { status: 429 }
      )
    }

    const { events } = await req.json()

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "No events" }, { status: 400 })
    }

    // Sanitize: only pass action + time, no PII
    const safeEvents = events.slice(0, 20).map((e: { action?: string; created_at?: string }) => ({
      action: String(e.action ?? "").slice(0, 50),
      time: String(e.created_at ?? ""),
    }))

    const prompt = `You are analyzing an admin activity timeline for a tipping platform. Explain what happened in 2-3 sentences.

Focus on:
- What the key actions were
- Any risk signals or suspicious patterns
- What the admin should investigate further

Timeline (oldest first):
${safeEvents.map((e: { time: string; action: string }) => `${e.time} — ${e.action}`).join("\n")}

Be concise and actionable. Do not speculate about PII or user identity.`

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        { role: "system", content: "You are a fraud analysis assistant. Be brief, factual, and helpful." },
        { role: "user", content: prompt },
      ],
    })

    let explanation = completion.choices[0]?.message?.content ?? ""

    // Run output through guard
    const guarded = guardOutput(explanation)
    explanation = guarded.text

    return NextResponse.json({ explanation })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
