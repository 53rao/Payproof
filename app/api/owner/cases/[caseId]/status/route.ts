import { NextResponse } from "next/server";
import { getCaseAccess } from "@/lib/case-access";
import { updateOwnerCaseStatus } from "@/lib/customer-case-store";
import { hasSavedCustomerReplyDraft } from "@/lib/case-assistant";

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await params;
    const access = await getCaseAccess(caseId);
    if (!access) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !["OPEN", "REVIEWED", "CLOSED"].includes(body.status)) return NextResponse.json({ error: "Choose a valid case status." }, { status: 400 });
    if (body.status === "CLOSED" && !access.owner) return NextResponse.json({ error: "PayProof admin closes a case after reviewing the merchant submission." }, { status: 403 });
    if (body.status === "CLOSED" && !await hasSavedCustomerReplyDraft(caseId)) return NextResponse.json({ error: "Save a customer reply draft for this case before moving it to Closed." }, { status: 409 });
    if (!await updateOwnerCaseStatus(caseId, body.status)) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: body.status }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Case status could not be saved." }, { status: 500 }); }
}
