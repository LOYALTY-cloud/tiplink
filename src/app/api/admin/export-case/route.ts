import { NextResponse } from "next/server"
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession"
import { requireRole } from "@/lib/auth/requireRole"
import { renderToBuffer } from "@react-pdf/renderer"
import { CaseReport, type CaseReportData } from "@/lib/pdf/CaseReport"
import React from "react"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const session = await getAdminFromRequest(req)
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    requireRole(session.role, ["owner"])

    const body = await req.json()
    const caseData = body.caseData as CaseReportData

    if (!caseData || !caseData.userId) {
      return NextResponse.json({ error: "Missing case data" }, { status: 400 })
    }

    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(CaseReport, { caseData }) as any
    )

    const handle = caseData.handle || caseData.userId.slice(0, 8)
    const dateStr = new Date().toISOString().split("T")[0]
    const filename = `case-report-${handle}-${dateStr}.pdf`

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    console.error("PDF generation error:", e)
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
  }
}
