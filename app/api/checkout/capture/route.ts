import { NextResponse } from "next/server";
import { captureDemoOrder } from "@/lib/demo-store";
import { containsProhibitedPaymentData } from "@/lib/privacy";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    const { orderId, outcome, paymentMethodNonce, reportedIssueType, reportedIssueDetails } = body as { orderId?: unknown; outcome?: unknown; paymentMethodNonce?: unknown; reportedIssueType?: unknown; reportedIssueDetails?: unknown };
    if (typeof orderId !== "string" || !/^([A-Z0-9-]{10,40}|SIM-[A-F0-9]{8}|DEMO-ORDER-[A-Z0-9-]+)$/i.test(orderId) || !["success", "decline", "duplicate"].includes(String(outcome))) return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    if (orderId.startsWith("BT-") && (typeof paymentMethodNonce !== "string" || paymentMethodNonce.length > 2048)) return NextResponse.json({ error: "A valid Braintree payment authorization is required." }, { status: 400 });
    if (outcome !== "success" && !["PAYMENT_DECLINED", "DUPLICATE_SUBMISSION", "OTHER"].includes(String(reportedIssueType))) return NextResponse.json({ error: "Choose what happened during checkout." }, { status: 400 });
    if (reportedIssueDetails !== undefined && (typeof reportedIssueDetails !== "string" || reportedIssueDetails.length > 1000)) return NextResponse.json({ error: "Issue details must be 1,000 characters or fewer." }, { status: 400 });
    if (typeof reportedIssueDetails === "string" && containsProhibitedPaymentData(reportedIssueDetails)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys from your note." }, { status: 400 });
    const result = await captureDemoOrder(orderId, outcome as "success" | "decline" | "duplicate", typeof paymentMethodNonce === "string" ? paymentMethodNonce : undefined, reportedIssueType as string | undefined, reportedIssueDetails as string | undefined);
    const raw = result.payment.raw;
    const origin = result.state.orders.find((order) => order.id === orderId)?.origin ?? "UNKNOWN";
    const isSimulated = orderId.startsWith("SIM-") || orderId.startsWith("DEMO-") || (typeof raw === "object" && raw !== null && "simulated" in raw && (raw as Record<string, unknown>).simulated === true);
    const failed = result.payment.status === "FAILED";
    const recovery = !failed ? null : origin === "HUMAN"
      ? { audience: "person", action: "open_order_help", message: "Your payment did not complete. You can contact the store for help or try another payment method." }
      : origin === "AGENT"
        ? { audience: "agent", action: "request_alternate_payment_method", message: "Payment failed. Request another payment method; do not retry the same authorization." }
        : { audience: "unknown", action: "merchant_review", message: "Payment failed and checkout origin is unconfirmed. Merchant review may be needed." };
    return NextResponse.json({ payment: { status: result.payment.status, issue: result.payment.issue, debug_id: result.payment.debug_id, transaction_id: "transaction_id" in result.payment ? result.payment.transaction_id : undefined }, simulated: isSimulated, origin, recovery }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not complete simulated payment." }, { status: 400 });
  }
}
