import { NextResponse } from "next/server";
import { getCaseAccess } from "@/lib/case-access";
import { getOwnerCase, updateOwnerCaseStatus } from "@/lib/customer-case-store";
import { hasMerchantCaseSubmission } from "@/lib/merchant-case-response";

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await params;
    const access = await getCaseAccess(caseId);
    if (!access) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !["OPEN", "REVIEWED", "CLOSED"].includes(body.status)) return NextResponse.json({ error: "Choose a valid case status." }, { status: 400 });
    if (!access.owner && body.status !== "REVIEWED") return NextResponse.json({ error: "PayProof admin manages case status." }, { status: 403 });
    if (!access.owner) {
      const existing = await getOwnerCase(caseId);
      if (!existing) return NextResponse.json({ error: "Case not found." }, { status: 404 });
      if (existing.status === "CLOSED") return NextResponse.json({ error: "This case review is closed. Contact PayProof admin to reopen it." }, { status: 409 });
    }
    if (body.status === "CLOSED" && !await hasMerchantCaseSubmission(caseId)) return NextResponse.json({ error: "The merchant must submit a response before this case can be closed." }, { status: 409 });
    if (!await updateOwnerCaseStatus(caseId, body.status)) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: body.status }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Case status could not be saved." }, { status: 500 }); }
}
