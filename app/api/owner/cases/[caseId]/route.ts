import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { getOwnerCase } from "@/lib/customer-case-store";
import { getCaseSnapshot } from "@/lib/case-assistant";
import { containsProhibitedPaymentData } from "@/lib/privacy";

type Context = { params: Promise<{ caseId: string }> };
export async function GET(_request: Request, { params }: Context) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const { caseId } = await params;
    const [record, snapshot] = await Promise.all([getOwnerCase(caseId), getCaseSnapshot(caseId)]);
    if (!record || !snapshot) return NextResponse.json({ error: "Case not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ case: record, snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Case records could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send the report as JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) return NextResponse.json({ error: "The report request is too large." }, { status: 413 });
  try {
    const { caseId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as { report?: unknown }).report !== "string") return NextResponse.json({ error: "Enter a report draft." }, { status: 400 });
    const report = (body as { report: string }).report;
    if (report.length > 12000) return NextResponse.json({ error: "The report is too long (12,000 characters maximum)." }, { status: 413 });
    const manualNotice = (body as { manualNotice?: unknown }).manualNotice;
    if (manualNotice !== undefined && (typeof manualNotice !== "string" || manualNotice.length > 4000)) return NextResponse.json({ error: "Manual notice details must be 4,000 characters or fewer." }, { status: 400 });
    if (typeof manualNotice === "string" && containsProhibitedPaymentData(manualNotice)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys before saving notice details." }, { status: 400 });
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Report saving requires the configured database." }, { status: 503 });
    if (!await db.case.findUnique({ where: { id: caseId }, select: { id: true } })) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const saved = await db.evidenceReport.upsert({ where: { caseId }, create: { caseId, body: report }, update: { body: report } });
    let noticeRecord: { id: string; createdAt: Date } | null = null;
    if (manualNotice !== undefined) {
      const existingNotice = await db.caseItem.findFirst({ where: { caseId, kind: "manual_paypal_notice" }, orderBy: { createdAt: "desc" } });
      if (manualNotice.trim()) {
        noticeRecord = existingNotice
          ? await db.caseItem.update({ where: { id: existingNotice.id }, data: { payload: { originalNoticeText: manualNotice }, completeness: "PRESENT" }, select: { id: true, createdAt: true } })
          : await db.caseItem.create({ data: { caseId, kind: "manual_paypal_notice", completeness: "PRESENT", payload: { originalNoticeText: manualNotice } }, select: { id: true, createdAt: true } });
      } else if (existingNotice) await db.caseItem.delete({ where: { id: existingNotice.id } });
      }
    return NextResponse.json({ report: saved.body, updatedAt: saved.updatedAt.toISOString(), manualNotice: noticeRecord ? { id: noticeRecord.id, createdAt: noticeRecord.createdAt.toISOString(), detail: manualNotice } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "The report could not be saved." }, { status: 500 }); }
}
