import { NextResponse } from "next/server";
import { verifyRequestOrigin } from "@/lib/auth";
import { getCaseAccess } from "@/lib/case-access";
import { containsProhibitedPaymentData } from "@/lib/privacy";
import { submitMerchantCaseResponse } from "@/lib/merchant-case-response";
import { getOwnerCase, updateOwnerCaseStatus } from "@/lib/customer-case-store";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send the response as JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 30_000) return NextResponse.json({ error: "The response request is too large." }, { status: 413 });

  try {
    const { caseId } = await params;
    const access = await getCaseAccess(caseId);
    if (!access) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401 });
    if (!access.merchantId) return NextResponse.json({ error: "Only the case merchant can submit a response to PayPal." }, { status: 403 });

    const body: unknown = await request.json();
    const response = body && typeof body === "object" ? (body as { response?: unknown }).response : undefined;
    const sourceIds = body && typeof body === "object" ? (body as { sourceIds?: unknown }).sourceIds : undefined;
    if (typeof response !== "string" || !response.trim()) return NextResponse.json({ error: "Draft or write a response before submitting." }, { status: 400 });
    if (response.length > 12_000) return NextResponse.json({ error: "The response must be 12,000 characters or fewer." }, { status: 413 });
    if (containsProhibitedPaymentData(response)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys before submitting." }, { status: 400 });

    const record = await getOwnerCase(caseId);
    if (!record) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    if (record.status === "CLOSED") return NextResponse.json({ error: "This case review is closed. Contact PayProof admin to reopen it." }, { status: 409 });

    const submission = await submitMerchantCaseResponse(caseId, response, sourceIds);
    if (!submission) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await updateOwnerCaseStatus(caseId, "REVIEWED");

    return NextResponse.json({ submission, status: "REVIEWED", simulated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The response could not be submitted." }, { status: 500 });
  }
}
