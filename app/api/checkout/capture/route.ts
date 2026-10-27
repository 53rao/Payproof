import { NextResponse } from "next/server";
import { captureDemoOrder } from "@/lib/demo-store";
import { containsProhibitedPaymentData } from "@/lib/privacy";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    const { orderId, outcome, reportedIssueType, reportedIssueDetails } = body as { orderId?: unknown; outcome?: unknown; reportedIssueType?: unknown; reportedIssueDetails?: unknown };
    if (typeof orderId !== "string" || !/^([A-Z0-9-]{10,40}|SIM-[A-F0-9]{8}|DEMO-ORDER-[A-Z0-9-]+)$/i.test(orderId) || !["success", "decline", "duplicate"].includes(String(outcome))) return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    if (outcome !== "success" && !["PAYMENT_DECLINED", "DUPLICATE_SUBMISSION", "OTHER"].includes(String(reportedIssueType))) return NextResponse.json({ error: "Choose what happened during checkout." }, { status: 400 });
    if (reportedIssueDetails !== undefined && (typeof reportedIssueDetails !== "string" || reportedIssueDetails.length > 1000)) return NextResponse.json({ error: "Issue details must be 1,000 characters or fewer." }, { status: 400 });
    if (typeof reportedIssueDetails === "string" && containsProhibitedPaymentData(reportedIssueDetails)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys from your note." }, { status: 400 });
    const result = await captureDemoOrder(orderId, outcome as "success" | "decline" | "duplicate", reportedIssueType as string | undefined, reportedIssueDetails as string | undefined);
    const raw = result.payment.raw;
    const isSimulated = orderId.startsWith("SIM-") || (typeof raw === "object" && raw !== null && "simulated" in raw && (raw as Record<string, unknown>).simulated === true);
    return NextResponse.json({ payment: { status: result.payment.status, issue: result.payment.issue, debug_id: result.payment.debug_id }, simulated: isSimulated }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not complete simulated payment." }, { status: 400 });
  }
}
