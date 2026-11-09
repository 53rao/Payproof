import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { createDemoOrder, captureDemoOrder } from "@/lib/demo-store";
import { listDatabaseDashboardSimulations } from "@/lib/database-demo-store";
import { isBraintreeConfigured } from "@/lib/braintree";
import { getDatabase } from "@/db/client";
import { DEMO_MERCHANTS } from "@/lib/merchants";

const FAILURE_TYPES = {
  processor_decline: { code: "PROCESSOR_DECLINE", label: "Processor decline", issue: "PROCESSOR_DECLINE" },
  instrument_expired: { code: "INSTRUMENT_EXPIRED", label: "Instrument expired", issue: "INSTRUMENT_EXPIRED" },
  duplicate_invoice: { code: "DUPLICATE_INVOICE", label: "Duplicate invoice", issue: "DUPLICATE_INVOICE_ID" },
  network_timeout: { code: "NETWORK_TIMEOUT", label: "Network timeout", issue: "NETWORK_TIMEOUT" },
  avs_mismatch: { code: "AVS_MISMATCH", label: "AVS mismatch", issue: "AVS_MISMATCH" },
} as const;

type FailureType = keyof typeof FAILURE_TYPES;
type OriginMode = "HUMAN" | "AGENT" | "MIXED";
type Compression = "compressed" | "spread";

const merchantProduct: Record<string, string> = {
  northstar: "mug",
  fieldform: "journal",
  apex: "tote",
  beacon: "backpack",
  solis: "blanket",
};

const merchantShortMap: Record<string, string> = {
  northstar: "NS",
  fieldform: "FF",
  apex: "AO",
  beacon: "BS",
  solis: "SS",
};

const ftShortMap: Record<string, string> = {
  processor_decline: "PD",
  instrument_expired: "IE",
  duplicate_invoice: "DI",
  network_timeout: "NT",
  avs_mismatch: "AV",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  if (!(await hasOwnerSession())) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const simulations = await listDatabaseDashboardSimulations();
    const db = getDatabase();
    if (db) {
      const simIds = simulations.map((s) => s.simulationId).filter((id): id is string => Boolean(id));
      if (simIds.length) {
        const diagnoses = await db.simulationDiagnosis.findMany({
          where: { simulationId: { in: simIds } },
          select: { simulationId: true, evidence: true },
        });
        const batchMap = new Map<string, { networkBatchId?: string; scenarioName?: string }>();
        for (const d of diagnoses) {
          if (d.evidence && typeof d.evidence === "object" && !Array.isArray(d.evidence)) {
            const ev = d.evidence as Record<string, unknown>;
            if (typeof ev.networkBatchId === "string") {
              const scName = typeof ev.scenarioName === "string" && ev.scenarioName.trim()
                ? ev.scenarioName.trim()
                : typeof ev.networkScenario === "string" && ev.networkScenario.trim()
                  ? ev.networkScenario.trim()
                  : undefined;
              batchMap.set(d.simulationId, {
                networkBatchId: ev.networkBatchId,
                scenarioName: scName,
              });
            }
          }
        }
        for (const sim of simulations) {
          if (sim.simulationId && batchMap.has(sim.simulationId)) {
            const info = batchMap.get(sim.simulationId)!;
            (sim as Record<string, unknown>).networkBatchId = info.networkBatchId;
            (sim as Record<string, unknown>).scenarioName = info.scenarioName;
            (sim as Record<string, unknown>).networkScenario = info.scenarioName;
          }
        }
      }
    }
    return NextResponse.json({ simulations }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Simulation history could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!(await hasOwnerSession())) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!verifyRequestOrigin(request)) {
    return NextResponse.json({ error: "Simulation request origin was not accepted." }, { status: 403 });
  }
  if (!getDatabase() || !isBraintreeConfigured()) {
    return NextResponse.json({ error: "Dashboard diagnostics require configured Braintree Sandbox and database connections." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const failureCount = typeof body.failureCount === "number" ? Math.floor(body.failureCount) : NaN;
    const failureType = body.failureType;
    const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
    const origin = body.origin;
    const timeCompression = body.timeCompression;
    const networkBatchId = typeof body.networkBatchId === "string" && body.networkBatchId.trim() ? body.networkBatchId.trim() : undefined;
    const scenarioName = typeof body.scenarioName === "string" && body.scenarioName.trim()
      ? body.scenarioName.trim()
      : typeof body.networkScenario === "string" && body.networkScenario.trim()
        ? body.networkScenario.trim()
        : undefined;
    const networkScenario = scenarioName;

    if (!Number.isFinite(failureCount) || failureCount < 1 || failureCount > 20) {
      return NextResponse.json({ error: "Failure count must be between 1 and 20." }, { status: 400 });
    }
    if (typeof failureType !== "string" || !(failureType in FAILURE_TYPES)) {
      return NextResponse.json({ error: "Choose a supported failure type." }, { status: 400 });
    }
    const knownMerchants = new Set(DEMO_MERCHANTS.map((m) => m.id));
    if (!merchantId || (!knownMerchants.has(merchantId) && !merchantProduct[merchantId])) {
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
    const ftShort = ftShortMap[failureType as string] ?? "PD";
    const merchantShort = merchantShortMap[merchantId] ?? merchantId.slice(0, 2).toUpperCase();
    const productId = merchantProduct[merchantId] ?? "mug";
    const merchantRecord = DEMO_MERCHANTS.find((m) => m.id === merchantId);
    const merchantName = merchantRecord?.name ?? merchantId;

    const db = getDatabase();
    if (db && networkBatchId) {
      await db.simulationDiagnosis.upsert({
        where: { simulationId },
        create: {
          simulationId,
          merchantId,
          patternDetected: "",
          likelyCause: "",
          evidence: { networkBatchId, scenarioName: scenarioName ?? "", networkScenario: scenarioName ?? "" },
          hypothesis: "",
          recommendedAction: "",
          confidence: "low",
          confidenceReason: "",
        },
        update: {
          evidence: { networkBatchId, scenarioName: scenarioName ?? "", networkScenario: scenarioName ?? "" },
        },
      }).catch(() => {});
    }

    const transactions: Array<{
      id: string;
      orderId: string;
      origin: "HUMAN" | "AGENT";
      outcome: string;
      transactionId: string | null;
      caseId: string | null;
      caseCreated: boolean;
      createdAt: string;
      failureType: FailureType;
      merchantId: string;
      simulationId: string;
      expectedSignal: string;
      observedSignal: string | null;
      scenarioMatched: boolean;
    }> = [];
    const transactionIds: string[] = [];
    const caseIds: string[] = [];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        try {
          for (let i = 0; i < failureCount; i++) {
            if (i > 0 && (timeCompression as Compression) === "spread") await sleep(2000);
            const iterationOrigin: "HUMAN" | "AGENT" =
              (origin as OriginMode) === "MIXED" ? (i % 2 === 0 ? "HUMAN" : "AGENT") : (origin as "HUMAN" | "AGENT");
            const originShort = iterationOrigin === "HUMAN" ? "H" : "A";
            const key = `SIMDASH-V2F-${simToken}-${ftShort}-${merchantShort}-${originShort}-${String(i + 1).padStart(2, "0")}-${randomUUID().slice(0, 8).toUpperCase()}`;
            const tokenHash = createHash("sha256").update(`owner-diagnostic:${key}`).digest("hex");
            const order = await createDemoOrder([{ id: productId, quantity: 1 }], key, tokenHash, undefined, iterationOrigin);

            // Emit transaction SENDING event
            send({
              type: "request",
              index: i + 1,
              total: failureCount,
              merchant: merchantName,
              amount: (order.amount ?? 28).toFixed(2),
              currency: "USD",
              failureType,
              origin: iterationOrigin,
              cardType: "Visa",
              last4: "1111",
            });

            const providerOutcome = failureType === "duplicate_invoice" ? "duplicate" : "decline";
            const note = `Diagnostic simulation ${simulationId}: ${ft.label} (${failureType}) for ${merchantId}, iteration ${i + 1}/${failureCount}${networkBatchId ? ` [batch:${networkBatchId}]` : ""}`;
            const result = await captureDemoOrder(
              order.id,
              providerOutcome,
              "fake-processor-declined-visa-nonce",
              ft.issue,
              note,
              {
                type: failureType as FailureType,
                label: ft.label,
                expectedSignal: ft.issue,
                ...(networkBatchId ? { networkBatchId, networkScenario } : {}),
              },
            );

            const caseRecord = result.state.cases.find((item) => item.orderId === order.id);
            const txId = "transaction_id" in result.payment ? result.payment.transaction_id ?? null : null;
            const raw = result.payment.raw as Record<string, unknown> | undefined;
            const observedSignal = typeof raw?.processorResponseCode === "string" ? raw.processorResponseCode : result.payment.issue ?? null;
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
              merchantId,
              simulationId,
              expectedSignal: ft.issue,
              observedSignal,
              scenarioMatched,
            });

            // Emit transaction RESPONSE event
            send({
              type: "response",
              index: i + 1,
              total: failureCount,
              transactionId: txId || `8k${randomUUID().slice(0, 6)}`,
              outcome: result.payment.status,
              processorResponseCode: (raw?.processorResponseCode as string) ?? "2000",
              processorResponseText: (raw?.processorResponseText as string) ?? "Do Not Honor",
              processorResponseType: (raw?.processorResponseType as string) ?? "soft_decline",
              gatewayRejectionReason: (raw?.gatewayRejectionReason as string | null) ?? null,
              avsPostalCode: (raw?.avsPostalCodeResponseCode as string) ?? "I",
              avsStreetAddress: (raw?.avsStreetAddressResponseCode as string) ?? "I",
              cvv: (raw?.cvvResponseCode as string) ?? "M",
              caseId: caseRecord?.id ?? null,
              caseCreated: Boolean(caseRecord),
            });
          }

          // Emit final COMPLETE event
          send({
            type: "complete",
            simulationId,
            merchantId,
            merchantName,
            totalTransactions: failureCount,
            allFailed: true,
            failureType,
            origin,
            timeCompression,
            transactionIds,
            caseIds,
            transactions,
            networkBatchId: networkBatchId ?? null,
            networkScenario: networkScenario ?? null,
          });

          controller.close();
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : "The Sandbox diagnostic could not be completed.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The Sandbox diagnostic could not be completed." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
