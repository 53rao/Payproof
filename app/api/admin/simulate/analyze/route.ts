import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { DEMO_MERCHANTS } from "@/lib/merchants";

type AnalyzeBody = {
  simulationId?: unknown;
  merchantId?: unknown;
  failureCount?: unknown;
  failureType?: unknown;
  origin?: unknown;
  transactionIds?: unknown;
  caseIds?: unknown;
  orderIds?: unknown;
};

const SYSTEM_PROMPT = `You are PayProof's diagnostic engine. You have received real payment event records from a merchant's checkout system. Analyze the pattern and produce a specific actionable diagnosis.

Rules:
- Base every claim on the actual records provided — do not generalize
- The requested scenario is only a test intention. Processor response fields and payment status are the observed facts; never describe the requested scenario as having occurred when those facts do not support it.
- Identify the specific signal combination that characterizes this pattern
- Produce a testable hypothesis the merchant can act on
- Never say "it appears" or "it seems" — be direct
- If the pattern is consistent with a carding attack say so explicitly with the evidence
- If the pattern suggests a checkout configuration issue identify which configuration
- If the pattern is consistent with normal agent commerce failure say so
- If confidence is low say so and explain why

Return JSON only with no markdown fences:
{
  "pattern_detected": "one line describing the exact pattern seen in the records",
  "likely_cause": "specific cause based on the signal combination in the records",
  "evidence": ["specific evidence item from the records", "specific evidence item from the records"],
  "hypothesis": "specific testable statement the merchant can verify against their own system",
  "recommended_action": "one specific thing the merchant or admin should do next",
  "confidence": "high | medium | low",
  "confidence_reason": "why this confidence level given the available records"
}`;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

function fallbackDiagnosis(context: Record<string, unknown>, reason: string) {
  const failureCount = typeof context.failureCount === "number" ? context.failureCount : 0;
  const failureType = typeof context.failureType === "string" ? context.failureType : "unknown";
  const merchantName = typeof context.merchantName === "string" ? context.merchantName : "merchant";
  return {
    pattern_detected: `${failureCount} ${failureType.replaceAll("_", " ")} failure(s) recorded for ${merchantName} in the diagnostic window.`,
    likely_cause: "Diagnostic model unavailable; diagnosis is based on recorded event metadata only.",
    evidence: [
      `Failure type recorded as ${failureType}.`,
      `Origin breakdown from records: ${JSON.stringify(context.originBreakdown ?? {})}.`,
    ],
    hypothesis: "Re-run analysis when the Groq diagnostic model is reachable to obtain a model-generated diagnosis from the same records.",
    recommended_action: "Verify GROQ_API_KEY/model configuration and retry the diagnostic analysis.",
    confidence: "low" as const,
    confidence_reason: reason,
  };
}

function parseDiagnosis(text: string, context: Record<string, unknown>) {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    const confidence = value.confidence === "high" || value.confidence === "medium" || value.confidence === "low" ? value.confidence : "low";
    const evidence = Array.isArray(value.evidence) ? value.evidence.filter((e): e is string => typeof e === "string").slice(0, 12) : [];
    return {
      pattern_detected: typeof value.pattern_detected === "string" && value.pattern_detected ? value.pattern_detected : fallbackDiagnosis(context, "Groq returned an incomplete diagnosis.").pattern_detected,
      likely_cause: typeof value.likely_cause === "string" && value.likely_cause ? value.likely_cause : fallbackDiagnosis(context, "Groq returned an incomplete diagnosis.").likely_cause,
      evidence: evidence.length ? evidence : fallbackDiagnosis(context, "Groq returned an incomplete diagnosis.").evidence,
      hypothesis: typeof value.hypothesis === "string" && value.hypothesis ? value.hypothesis : fallbackDiagnosis(context, "Groq returned an incomplete diagnosis.").hypothesis,
      recommended_action: typeof value.recommended_action === "string" && value.recommended_action ? value.recommended_action : fallbackDiagnosis(context, "Groq returned an incomplete diagnosis.").recommended_action,
      confidence,
      confidence_reason: typeof value.confidence_reason === "string" && value.confidence_reason ? value.confidence_reason : "Model response omitted confidence reason.",
    };
  } catch {
    return fallbackDiagnosis(context, "Groq returned a response that could not be parsed as diagnosis JSON.");
  }
}

async function callGroq(context: Record<string, unknown>) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallbackDiagnosis(context, "GROQ_API_KEY is not configured.");
  const primary = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  const fallback = process.env.GROQ_FALLBACK_MODEL?.trim() || "openai/gpt-oss-120b";
  const models = [...new Set([primary, fallback])];
  for (const model of models) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_completion_tokens: 1100,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(context) },
          ],
        }),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) continue;
      return parseDiagnosis(content, context);
    } catch {
      // try fallback model
    }
  }
  return fallbackDiagnosis(context, "Groq was unreachable or returned no usable diagnosis.");
}

export async function POST(request: Request) {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Analysis request origin was not accepted." }, { status: 403 });
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "DATABASE_URL is required for diagnostic analysis." }, { status: 503 });

  try {
    const body = (await request.json()) as AnalyzeBody;
    const simulationId = typeof body.simulationId === "string" ? body.simulationId : "";
    const merchantId = typeof body.merchantId === "string" ? body.merchantId : "";
    const failureCount = typeof body.failureCount === "number" ? body.failureCount : 0;
    const failureType = typeof body.failureType === "string" ? body.failureType : "unknown";
    const origin = typeof body.origin === "string" ? body.origin : "UNKNOWN";
    const transactionIds = asStringArray(body.transactionIds);
    const caseIds = asStringArray(body.caseIds);
    const orderIds = asStringArray(body.orderIds);

    if (!simulationId) return NextResponse.json({ error: "simulationId is required." }, { status: 400 });

    // Read actual payment event records (CAPTURE_RESULT) for the simulation. Prefer orderIds if provided; otherwise resolve by transactionId in rawJson.
    let paymentEvents = await db.paymentEvent.findMany({
      where: orderIds.length
        ? { orderId: { in: orderIds }, type: "CAPTURE_RESULT" }
        : { type: "CAPTURE_RESULT", order: { idempotencyKey: { startsWith: `SIMDASH-V2F-${simulationId.replaceAll("-", "").toUpperCase()}-` } } },
      include: { order: { select: { id: true, checkoutOrigin: true, idempotencyKey: true, createdAt: true, items: { select: { productId: true } } } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (!paymentEvents.length && transactionIds.length) {
      const recent = await db.paymentEvent.findMany({
        where: { type: "CAPTURE_RESULT", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        include: { order: { select: { id: true, checkoutOrigin: true, idempotencyKey: true, createdAt: true, items: { select: { productId: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const txSet = new Set(transactionIds);
      paymentEvents = recent.filter((e) => {
        const raw = e.rawJson as Record<string, unknown> | null;
        return raw && typeof raw.transactionId === "string" && txSet.has(raw.transactionId);
      }).reverse();
    }

    const cases = caseIds.length
      ? await db.case.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, type: true, status: true, cause: true, orderId: true, createdAt: true, agentHandled: true, humanReviewRequired: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const merchant = DEMO_MERCHANTS.find((m) => m.id === merchantId) ?? (await db.merchant.findUnique({ where: { id: merchantId }, select: { name: true } }).catch(() => null));
    const merchantName = (merchant && "name" in merchant ? merchant.name : null) ?? merchantId ?? "Unknown merchant";

    const timestamps = paymentEvents.map((e) => e.createdAt.getTime()).filter(Number.isFinite);
    const start = timestamps.length ? new Date(Math.min(...timestamps)) : new Date();
    const end = timestamps.length ? new Date(Math.max(...timestamps)) : new Date();
    const windowStart = new Date(start.getTime() - 60_000);
    const windowEnd = new Date(end.getTime() + 60_000);

    const agentActions = await db.agentActionLog.findMany({
      where: { merchantId: merchantId || undefined, createdAt: { gte: windowStart, lte: windowEnd } },
      select: { type: true, detail: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }).catch(() => []);

    const originBreakdown = { human: 0, agent: 0, unknown: 0 };
    for (const e of paymentEvents) {
      const o = e.order.checkoutOrigin;
      if (o === "HUMAN") originBreakdown.human++;
      else if (o === "AGENT") originBreakdown.agent++;
      else originBreakdown.unknown++;
    }

    const processorResponseCodes: string[] = [];
    const avsResults: string[] = [];
    const cvvResults: string[] = [];
    for (const e of paymentEvents) {
      if (e.issue) processorResponseCodes.push(e.issue);
      if (e.paymentStatus) processorResponseCodes.push(`status:${e.paymentStatus}`);
      const raw = e.rawJson as Record<string, unknown> | null;
      if (raw) {
        if (typeof raw.processorResponseCode === "string") processorResponseCodes.push(raw.processorResponseCode);
        if (typeof raw.processorResponseText === "string") processorResponseCodes.push(raw.processorResponseText);
        if (typeof raw.avsPostalCodeResponseCode === "string") avsResults.push(raw.avsPostalCodeResponseCode);
        if (typeof raw.avsStreetAddressResponseCode === "string") avsResults.push(raw.avsStreetAddressResponseCode);
        if (typeof raw.cvvResponseCode === "string") cvvResults.push(raw.cvvResponseCode);
        const tx = raw.transaction && typeof raw.transaction === "object" ? (raw.transaction as Record<string, unknown>) : null;
        if (tx) {
          if (typeof tx.processorResponseCode === "string") processorResponseCodes.push(tx.processorResponseCode);
          if (typeof tx.avsPostalCodeResponseCode === "string") avsResults.push(tx.avsPostalCodeResponseCode);
          if (typeof tx.cvvResponseCode === "string") cvvResults.push(tx.cvvResponseCode);
        }
      }
    }

    const context = {
      merchantName,
      failureCount: failureCount || paymentEvents.length,
      failureType,
      originBreakdown,
      timestampRange: { start: start.toISOString(), end: end.toISOString() },
      processorResponseCodes: [...new Set(processorResponseCodes)].slice(0, 20),
      avsResults: [...new Set(avsResults)].slice(0, 20),
      cvvResults: [...new Set(cvvResults)].slice(0, 20),
      caseTypesCreated: [...new Set(cases.map((c) => c.type))],
      agentActionsTaken: [...new Set(agentActions.map((a) => `${a.type}: ${a.detail}`))].slice(0, 20),
      paymentEventRecords: paymentEvents.map((e) => {
        const raw = e.rawJson as Record<string, unknown> | null;
        const scenario = raw?.diagnosticScenario && typeof raw.diagnosticScenario === "object" ? raw.diagnosticScenario as Record<string, unknown> : null;
        const observedSignal = raw && typeof raw.processorResponseCode === "string" ? raw.processorResponseCode : e.issue;
        const scenarioType = typeof scenario?.type === "string" ? scenario.type : null;
        return {
          orderId: e.orderId,
          type: e.type,
          paymentStatus: e.paymentStatus,
          issue: e.issue,
          debugId: e.debugId,
          createdAt: e.createdAt.toISOString(),
          checkoutOrigin: e.order.checkoutOrigin,
          transactionId: raw && typeof raw.transactionId === "string" ? raw.transactionId : null,
          processor: raw && typeof raw.processorResponseCode === "string" ? raw.processorResponseCode : null,
          requestedScenario: scenarioType,
          expectedSignal: typeof scenario?.expectedSignal === "string" ? scenario.expectedSignal : null,
          observedSignal,
          scenarioMatched: scenarioType === "processor_decline"
            ? e.paymentStatus === "FAILED" && Boolean(observedSignal)
            : scenarioType ? Boolean(observedSignal && observedSignal === scenario?.expectedSignal) : null,
          rawKeys: raw ? Object.keys(raw).slice(0, 12) : [],
        };
      }),
      caseRecords: cases.map((c) => ({ id: c.id, type: c.type, status: c.status, cause: c.cause, agentHandled: c.agentHandled, humanReviewRequired: c.humanReviewRequired, createdAt: c.createdAt.toISOString() })),
      sourceNote: "Records above were read from the database for the provided simulation identifiers.",
    };

    let diagnosis = await callGroq(context);
    const records = context.paymentEventRecords;
    const mismatches = records.filter((record) => record.scenarioMatched === false);
    if (mismatches.length) {
      const observed = [...new Set(mismatches.map((record) => record.observedSignal).filter(Boolean))].join(", ") || "no processor signal";
      diagnosis = {
        ...diagnosis,
        pattern_detected: `The requested scenario did not match the recorded processor response in ${mismatches.length} of ${mismatches.length + records.filter((record) => record.scenarioMatched === true).length} captured transaction(s).`,
        likely_cause: `The Sandbox recorded ${observed}. Use this processor result for diagnosis; the requested scenario label is not evidence that another failure mode occurred.`,
        evidence: [...diagnosis.evidence, ...mismatches.slice(0, 5).map((record) => `Requested ${record.requestedScenario}; observed ${record.observedSignal ?? "no processor signal"} for order ${record.orderId}.`)],
        confidence: "low",
        confidence_reason: "At least one requested failure scenario disagrees with the stored processor response.",
      };
    }
    const analyzedAt = new Date().toISOString();
    // M12: persist every diagnosis automatically (upsert by simulationId).
    try {
      await db.simulationDiagnosis.upsert({
        where: { simulationId },
        create: {
          simulationId,
          merchantId: merchantId || "unknown",
          patternDetected: diagnosis.pattern_detected,
          likelyCause: diagnosis.likely_cause,
          evidence: diagnosis.evidence as unknown as object,
          hypothesis: diagnosis.hypothesis,
          recommendedAction: diagnosis.recommended_action,
          confidence: diagnosis.confidence,
          confidenceReason: diagnosis.confidence_reason,
        },
        update: {
          merchantId: merchantId || "unknown",
          patternDetected: diagnosis.pattern_detected,
          likelyCause: diagnosis.likely_cause,
          evidence: diagnosis.evidence as unknown as object,
          hypothesis: diagnosis.hypothesis,
          recommendedAction: diagnosis.recommended_action,
          confidence: diagnosis.confidence,
          confidenceReason: diagnosis.confidence_reason,
        },
      });
    } catch {
      // Diagnosis is still returned; persistence failure should not block the diagnostic response.
    }
    return NextResponse.json({ simulationId, merchantId, merchantName, diagnosis, analyzedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Diagnostic analysis could not be completed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
