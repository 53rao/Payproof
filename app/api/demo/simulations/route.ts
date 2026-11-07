import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { createDemoOrder, captureDemoOrder } from "@/lib/demo-store";
import { listDatabaseDashboardSimulations } from "@/lib/database-demo-store";
import { isBraintreeConfigured } from "@/lib/braintree";
import { getDatabase } from "@/db/client";

const scenarios = {
  HUMAN_SUCCESS: { origin: "HUMAN" as const, productId: "mug", success: true },
  HUMAN_FAILURE: { origin: "HUMAN" as const, productId: "mug", success: false },
  AGENT_SUCCESS: { origin: "AGENT" as const, productId: "journal", success: true },
  AGENT_FAILURE: { origin: "AGENT" as const, productId: "journal", success: false },
};

export async function GET() {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ simulations: await listDatabaseDashboardSimulations() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Simulation history could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Simulation request origin was not accepted." }, { status: 403 });
  if (!getDatabase() || !isBraintreeConfigured()) return NextResponse.json({ error: "Dashboard simulations require configured Braintree Sandbox and database connections." }, { status: 503 });

  try {
    const body: unknown = await request.json();
    const scenarioName = body && typeof body === "object" ? (body as { scenario?: unknown }).scenario : undefined;
    if (typeof scenarioName !== "string" || !Object.hasOwn(scenarios, scenarioName)) return NextResponse.json({ error: "Choose one of the four supported transaction scenarios." }, { status: 400 });
    const scenario = scenarios[scenarioName as keyof typeof scenarios];
    const key = `SIMDASH-${scenarioName.replaceAll("_", "-")}-${randomUUID().toUpperCase()}`;
    const tokenHash = createHash("sha256").update(key).digest("hex");
    const order = await createDemoOrder([{ id: scenario.productId, quantity: 1 }], key, tokenHash, undefined, scenario.origin);
    const result = await captureDemoOrder(order.id, scenario.success ? "success" : "decline", scenario.success ? "fake-valid-nonce" : "fake-processor-declined-visa-nonce", scenario.success ? undefined : "PAYMENT_DECLINED", scenario.success ? undefined : `Dashboard scenario: ${scenarioName}`, "respect-protection");
    const caseRecord = result.state.cases.find((item) => item.orderId === order.id);
    const transactionId = "transaction_id" in result.payment ? result.payment.transaction_id ?? null : null;
    const row = {
      id: order.id,
      scenario: scenarioName.toLowerCase(),
      origin: scenario.origin,
      outcome: result.payment.status,
      transactionId,
      caseCreated: Boolean(caseRecord),
      caseId: caseRecord?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json({ simulation: row, provider: "BRAINTREE SANDBOX" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Sandbox simulation could not be completed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
