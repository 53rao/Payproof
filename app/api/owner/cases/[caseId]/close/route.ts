import { NextResponse } from "next/server";
import { verifyRequestOrigin } from "@/lib/auth";
import { getCaseAccess } from "@/lib/case-access";
import { getDatabase } from "@/db/client";
import { closeMemoryCase } from "@/lib/demo-store";
import { hasMerchantCaseSubmission } from "@/lib/merchant-case-response";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  const { caseId } = await params;
  try {
    const access = await getCaseAccess(caseId);
    if (!access) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (!access.owner) return NextResponse.json({ error: "Only PayProof admin can close a case review." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    if (!await hasMerchantCaseSubmission(caseId)) return NextResponse.json({ error: "The merchant must submit a response before this review can close." }, { status: 409 });
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
