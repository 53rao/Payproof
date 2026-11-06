import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/lib/auth";
import { updateOwnerCaseStatus } from "@/lib/customer-case-store";
import { hasSavedCustomerReplyDraft } from "@/lib/case-assistant";

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !["OPEN", "REVIEWED", "CLOSED"].includes(body.status)) return NextResponse.json({ error: "Choose a valid case status." }, { status: 400 });
  try {
    const { caseId } = await params;
    if (body.status === "CLOSED" && !await hasSavedCustomerReplyDraft(caseId)) return NextResponse.json({ error: "Save a customer reply draft for this case before moving it to Closed." }, { status: 409 });
    if (!await updateOwnerCaseStatus(caseId, body.status)) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: body.status }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Case status could not be saved." }, { status: 500 }); }
}
