import "server-only";
import { getDatabase } from "@/db/client";

type IncidentType = "FAILURE_SPIKE" | "CARDING_PATTERN" | "AGENT_REVIEW_REQUIRED" | "CASE_THRESHOLD_EXCEEDED";
type IncidentAction = "NOTIFY_MERCHANT" | "FLAG_FOR_MONITORING" | "DISMISS";
type Incident = {
  id: string;
  type: IncidentType;
  merchantName: string;
  merchantId: string;
  summary: string;
  detail: string;
  confidence: string;
  detectedAt: string;
  actions: IncidentAction[];
  caseCount?: number;
  oldestCaseAgeHours?: number;
};

const actions: IncidentAction[] = ["NOTIFY_MERCHANT", "FLAG_FOR_MONITORING", "DISMISS"];

function classifyFailures(failures: { issue: string | null }[]) {
  if (failures.length < 3) return "Insufficient data";
  const counts = failures.reduce<Record<string, number>>((result, row) => {
    const code = row.issue?.trim();
    if (code) result[code] = (result[code] ?? 0) + 1;
    return result;
  }, {});
  const dominantShare = failures.length ? Math.max(0, ...Object.values(counts)) / failures.length : 0;
  if (dominantShare >= 0.6) return "Likely merchant configuration issue";
  if (new Set(failures.map((row) => row.issue?.trim()).filter(Boolean)).size > 1) return "Likely buyer funding issues";
  return "Mixed signals — review cases";
}

export async function detectIncidents(): Promise<Incident[]> {
  const db = getDatabase();
  if (!db) return [];

  const detectedAt = new Date();
  const fifteenMinutesAgo = new Date(detectedAt.getTime() - 15 * 60_000);
  const fiveMinutesAgo = new Date(detectedAt.getTime() - 5 * 60_000);
  const [recentPayments, openAgentCases, openCases] = await Promise.all([
    db.paymentEvent.findMany({
      where: { type: "CAPTURE_RESULT", createdAt: { gte: fifteenMinutesAgo } },
      select: {
        id: true,
        orderId: true,
        paymentStatus: true,
        issue: true,
        createdAt: true,
        order: {
          select: {
            items: {
              select: { product: { select: { merchant: { select: { id: true, name: true } } } } },
            },
          },
        },
      },
    }),
    db.case.findMany({
      where: { status: "OPEN", humanReviewRequired: true, agentHandled: true },
      select: {
        id: true,
        createdAt: true,
        order: {
          select: {
            items: {
              select: { product: { select: { merchant: { select: { id: true, name: true } } } } },
            },
          },
        },
      },
    }),
    db.case.findMany({
      where: { status: "OPEN" },
      select: {
        id: true,
        createdAt: true,
        order: {
          select: {
            items: {
              select: { product: { select: { merchant: { select: { id: true, name: true } } } } },
            },
          },
        },
      },
    }),
  ]);

  const incidents: Incident[] = [];
  const paymentGroups = new Map<string, { merchantName: string; events: typeof recentPayments }>();
  for (const event of recentPayments) {
    const merchantMap = new Map<string, string>();
    for (const item of event.order.items) merchantMap.set(item.product.merchant.id, item.product.merchant.name);
    for (const [merchantId, merchantName] of merchantMap) {
      const group = paymentGroups.get(merchantId) ?? { merchantName, events: [] };
      group.events.push(event);
      paymentGroups.set(merchantId, group);
    }
  }

  for (const [merchantId, group] of paymentGroups) {
    const failures = group.events.filter((event) => event.paymentStatus === "FAILED");
    const failureRate = group.events.length ? failures.length / group.events.length : 0;
    if (group.events.length >= 5 && failureRate > 0.5) {
      const classification = classifyFailures(failures);
      incidents.push({
        id: `FAILURE_SPIKE:${merchantId}`,
        type: "FAILURE_SPIKE",
        merchantName: group.merchantName,
        merchantId,
        summary: `${Math.round(failureRate * 100)}% of ${group.events.length} payment attempts failed in the last 15 minutes.`,
        detail: `${failures.length} failed attempts · ${fifteenMinutesAgo.toISOString()} to ${detectedAt.toISOString()} · ${classification}`,
        confidence: classification,
        detectedAt: detectedAt.toISOString(),
        actions,
      });
    }

    const recentFailures = group.events.filter((event) => event.paymentStatus === "FAILED" && event.createdAt >= fiveMinutesAgo);
    const failedOrderIds = [...new Set(recentFailures.map((event) => event.orderId))];
    if (failedOrderIds.length >= 5) {
      incidents.push({
        id: `CARDING_PATTERN:${merchantId}`,
        type: "CARDING_PATTERN",
        merchantName: group.merchantName,
        merchantId,
        summary: `${failedOrderIds.length} distinct orders failed in the last 5 minutes.`,
        detail: `Failed orders: ${failedOrderIds.length} · ${fiveMinutesAgo.toISOString()} to ${detectedAt.toISOString()}`,
        confidence: "Possible carding attack — elevated rapid failures detected",
        detectedAt: detectedAt.toISOString(),
        actions,
      });
    }
  }

  const reviewGroups = new Map<string, { merchantName: string; cases: typeof openAgentCases }>();
  for (const caseRecord of openAgentCases) {
    const merchantMap = new Map<string, string>();
    for (const item of caseRecord.order.items) merchantMap.set(item.product.merchant.id, item.product.merchant.name);
    for (const [merchantId, merchantName] of merchantMap) {
      const group = reviewGroups.get(merchantId) ?? { merchantName, cases: [] };
      group.cases.push(caseRecord);
      reviewGroups.set(merchantId, group);
    }
  }
  for (const [merchantId, group] of reviewGroups) {
    const caseIds = [...new Set(group.cases.map((item) => item.id))];
    incidents.push({
      id: `AGENT_REVIEW_REQUIRED:${merchantId}`,
      type: "AGENT_REVIEW_REQUIRED",
      merchantName: group.merchantName,
      merchantId,
      summary: `${caseIds.length} open agent failure ${caseIds.length === 1 ? "case needs" : "cases need"} human review.`,
      detail: `Case IDs: ${caseIds.join(", ")}`,
      confidence: "Recorded case state requires human review",
      detectedAt: detectedAt.toISOString(),
      actions,
    });
  }

  const caseThresholdGroups = new Map<string, { merchantName: string; cases: typeof openCases }>();
  for (const caseRecord of openCases) {
    const merchantMap = new Map<string, string>();
    for (const item of caseRecord.order.items) merchantMap.set(item.product.merchant.id, item.product.merchant.name);
    for (const [merchantId, merchantName] of merchantMap) {
      const group = caseThresholdGroups.get(merchantId) ?? { merchantName, cases: [] };
      group.cases.push(caseRecord);
      caseThresholdGroups.set(merchantId, group);
    }
  }
  for (const [merchantId, group] of caseThresholdGroups) {
    const cases = [...new Map(group.cases.map((item) => [item.id, item])).values()];
    if (cases.length < 5) continue;
    const oldestCreatedAt = Math.min(...cases.map((item) => item.createdAt.getTime()));
    const oldestCaseAgeHours = Math.max(0, Math.round(((detectedAt.getTime() - oldestCreatedAt) / 3_600_000) * 10) / 10);
    incidents.push({
      id: `CASE_THRESHOLD_EXCEEDED:${merchantId}`,
      type: "CASE_THRESHOLD_EXCEEDED",
      merchantName: group.merchantName,
      merchantId,
      summary: `${cases.length} open cases — merchant may need direct support.`,
      detail: `Oldest unresolved case: ${oldestCaseAgeHours} hours old · ${new Date(oldestCreatedAt).toISOString()}`,
      confidence: "Open case count reached the support threshold",
      detectedAt: detectedAt.toISOString(),
      actions: ["NOTIFY_MERCHANT", "DISMISS"],
      caseCount: cases.length,
      oldestCaseAgeHours,
    });
  }

  return incidents;
}
