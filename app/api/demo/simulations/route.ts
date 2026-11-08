import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { createDemoOrder, captureDemoOrder } from "@/lib/demo-store";
import { listDatabaseDashboardSimulations } from "@/lib/database-demo-store";
import { isBraintreeConfigured } from "@/lib/braintree";
import { getDatabase } from "@/db/client";

const FAILURE_TYPES = {
  processor_decline: { code: "PROCESSOR_DECLINE", label: "Processor decline", issue: "PROCESSOR_DECLINE" },
  instrument_expired: { code: "INSTRUMENT_EXPIRED", label: "Instrument expired", issue: "INSTRUMENT_EXPIRED" },
  duplicate_invoice: { code: "DUPLICATE_INVOICE", label: "Duplicate invoice", issue: "DUPLICATE_INVOICE_ID" },
  network_timeout: { code: "NETWORK_TIMEOUT", label: "Network timeout", issue: "NETWORK_TIMEOUT" },
} as const;

type FailureType = keyof typeof FAILURE_TYPES;
type MerchantId = "northstar" | "fieldform";
type OriginMode = "HUMAN" | "AGENT" | "MIXED";
type Compression = "compressed" | "spread";

const merchantProduct: Record<MerchantId, string> = { northstar: "mug", fieldform: "journal" };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ simulations: await listDatabaseDashboardSimulations() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Simulation history could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Simulation request origin was not accepted." }, { status: 403 });
  if (!getDatabase() || !isBraintreeConfigured()) return NextResponse.json({ error: "Dashboard diagnostics require configured Braintree Sandbox and database connections." }, { status: 503 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const failureCount = typeof body.failureCount === "number" ? Math.floor(body.failureCount) : NaN;
    const failureType = body.failureType;
    const merchantId = body.merchantId;
    const origin = body.origin;
    const timeCompression = body.timeCompression;

    if (!Number.isFinite(failureCount) || failureCount < 1 || failureCount > 20) {
      return NextResponse.json({ error: "Failure count must be between 1 and 20." }, { status: 400 });
    }
    if (typeof failureType !== "string" || !(failureType in FAILURE_TYPES)) {
      return NextResponse.json({ error: "Choose a supported failure type." }, { status: 400 });
    }
    if (merchantId !== "northstar" && merchantId !== "fieldform") {
      return NextResponse.json({ error: "Choose a supported merchant." }, { status: 400 });
    }
    if (origin !== "HUMAN" && origin !== "AGENT" && origin !== "MIXED") {
      return NextResponse.json({ error: "Choose a supported origin." }, { status: 400 });
    }
    if (timeCompression !== "compressed" && timeCompression !== "spread") {
      return NextResponse.json({ error: "Choose a supported time compression." }, { status: 400 });
    }

    const ft = FAILURE_TYPES[failureType as FailureType];
    const simulationId = randomUUID();
    const simToken = simulationId.replaceAll("-", "").toUpperCase();
    const ftShort = { processor_decline: "PD", instrument_expired: "IE", duplicate_invoice: "DI", network_timeout: "NT" }[failureType as FailureType];
    const merchantShort = merchantId === "northstar" ? "NS" : "FF";
    const productId = merchantProduct[merchantId as MerchantId];
    const transactions: Array<{ id: string; orderId: string; origin: "HUMAN" | "AGENT"; outcome: string; transactionId: string | null; caseId: string | null; caseCreated: boolean; createdAt: string; failureType: string; merchantId: string; simulationId: string; expectedSignal: string; observedSignal: string | null; scenarioMatched: boolean }> = [];
    const transactionIds: string[] = [];
    const caseIds: string[] = [];

    for (let i = 0; i < failureCount; i++) {
      if (i > 0 && (timeCompression as Compression) === "spread") await sleep(2000);
      const iterationOrigin: "HUMAN" | "AGENT" =
        (origin as OriginMode) === "MIXED" ? (i % 2 === 0 ? "HUMAN" : "AGENT") : (origin as "HUMAN" | "AGENT");
      const originShort = iterationOrigin === "HUMAN" ? "H" : "A";
      // Fresh idempotency key per transaction (all failure types, including duplicate_invoice label mode).
      const key = `SIMDASH-V2F-${simToken}-${ftShort}-${merchantShort}-${originShort}-${String(i + 1).padStart(2, "0")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const tokenHash = createHash("sha256").update(`owner-diagnostic:${key}`).digest("hex");
      const order = await createDemoOrder([{ id: productId, quantity: 1 }], key, tokenHash, undefined, iterationOrigin);
      const providerOutcome = failureType === "duplicate_invoice" ? "duplicate" : "decline";
      const note = `Diagnostic simulation ${simulationId}: ${ft.label} (${failureType}) for ${merchantId}, iteration ${i + 1}/${failureCount}`;
      const result = await captureDemoOrder(
        order.id,
        providerOutcome,
        "fake-processor-declined-visa-nonce",
        ft.issue,
        note,
        { type: failureType as FailureType, label: ft.label, expectedSignal: ft.issue },
      );
      const caseRecord = result.state.cases.find((item) => item.orderId === order.id);
      const txId = "transaction_id" in result.payment ? result.payment.transaction_id ?? null : null;
      const raw = result.payment.raw as Record<string, unknown>;
      const observedSignal = typeof raw.processorResponseCode === "string" ? raw.processorResponseCode : result.payment.issue ?? null;
      const scenarioMatched = failureType === "processor_decline"
        ? result.payment.status === "FAILED" && Boolean(observedSignal)
        : Boolean(observedSignal && observedSignal.toLowerCase() === ft.issue.toLowerCase());
      if (txId) transactionIds.push(txId);
      if (caseRecord?.id) caseIds.push(caseRecord.id);
      transactions.push({
        id: order.id,
        orderId: order.id,
        origin: iterationOrigin,
        outcome: result.payment.status,
        transactionId: txId,
        caseId: caseRecord?.id ?? null,
        caseCreated: Boolean(caseRecord),
        createdAt: new Date().toISOString(),
        failureType: failureType as FailureType,
        merchantId: merchantId as MerchantId,
        simulationId,
        expectedSignal: ft.issue,
        observedSignal,
        scenarioMatched,
      });
    }

    return NextResponse.json(
      {
        simulationId,
        merchantId,
        failureCount,
        failureType,
        origin,
        timeCompression,
        transactions,
        transactionIds,
        caseIds,
        simulation: transactions[transactions.length - 1] ?? null,
        provider: "BRAINTREE SANDBOX",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Sandbox diagnostic could not be completed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
