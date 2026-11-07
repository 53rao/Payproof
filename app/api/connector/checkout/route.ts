import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { connectorSecretMatches } from "@/lib/auth";
import { createDemoOrder, captureDemoOrder } from "@/lib/demo-store";
import { isBraintreeConfigured } from "@/lib/braintree";
import { products } from "@/lib/products";

export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!connectorSecretMatches(bearer)) return NextResponse.json({ error: "Connector credentials were not accepted." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Agent checkout requires persistent database storage." }, { status: 503 });
  if (!isBraintreeConfigured()) return NextResponse.json({ error: "Agent checkout requires configured Braintree Sandbox credentials." }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "Checkout requests must be smaller than 16 KB." }, { status: 413 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (typeof input.idempotencyKey !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(input.idempotencyKey)) return NextResponse.json({ error: "A valid idempotencyKey is required." }, { status: 400 });
    if (typeof input.paymentMethodNonce !== "string" || input.paymentMethodNonce.length > 2048) return NextResponse.json({ error: "A valid Braintree payment authorization is required." }, { status: 400 });
    if (!Array.isArray(input.items) || !input.items.length) return NextResponse.json({ error: "At least one cart item is required." }, { status: 400 });
    const items: { id: string; quantity: number }[] = [];
    for (const value of input.items) {
      if (!value || typeof value !== "object") return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
      const { id, quantity } = value as { id?: unknown; quantity?: unknown };
      if (typeof id !== "string" || !products.some((product) => product.id === id) || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return NextResponse.json({ error: "Cart items must use known products and quantities from 1 to 20." }, { status: 400 });
      const existing = items.find((item) => item.id === id);
      if (existing) existing.quantity += quantity; else items.push({ id, quantity });
    }
    const tokenHash = createHash("sha256").update(`agent:${input.idempotencyKey}`).digest("hex");
    const order = await createDemoOrder(items, input.idempotencyKey, tokenHash, undefined, "AGENT");
    const result = await captureDemoOrder(order.id, "success", input.paymentMethodNonce);
    const createdCase = result.state.cases.find((item) => item.orderId === order.id);
    const succeeded = result.payment.status === "COMPLETED";
    return NextResponse.json({
      orderId: order.id,
      paymentStatus: succeeded ? "COMPLETED" : "FAILED",
      origin: "AGENT",
      simulated: false,
      humanReview: { required: !succeeded, caseId: createdCase?.id ?? null },
      recovery: succeeded
        ? { action: "none", message: "Payment completed." }
        : { action: "request_alternate_payment_method", message: "Payment failed. Request another payment method; do not retry the same authorization.", customerFacing: false },
      payment: { issue: result.payment.issue ?? null, transactionId: "transaction_id" in result.payment ? result.payment.transaction_id ?? null : null },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent checkout could not be completed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
