import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { closeMemoryCase } from "@/lib/demo-store";
import { hasSavedCustomerReplyDraft } from "@/lib/case-assistant";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { caseId } = await params;
  try {
    if (!await hasSavedCustomerReplyDraft(caseId)) return NextResponse.json({ error: "Save a customer reply draft before closing this review." }, { status: 409 });
    const db = getDatabase();
    if (!db) {
      if (!closeMemoryCase(caseId)) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    } else {
      const result = await db.case.updateMany({ where: { id: caseId, status: { not: "CLOSED" } }, data: { status: "CLOSED" } });
      if (!result.count) {
        const existing = await db.case.findUnique({ where: { id: caseId }, select: { status: true } });
        if (!existing) return NextResponse.json({ error: "Case not found." }, { status: 404 });
      }
    }
    return NextResponse.json({ status: "CLOSED" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The review could not be closed." }, { status: 500 });
  }
}
