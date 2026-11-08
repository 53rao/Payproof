import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { getDemoState, getOrderActivityList } from "@/lib/demo-store";
import { hasOwnerSession } from "@/lib/auth";
import { getMerchantForProduct } from "@/lib/merchants";
import { Prisma } from "@prisma/client";

type RawFacts = Record<string, unknown>;

function readString(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function mapRaw(raw: unknown): RawFacts {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as RawFacts : {};
}

function scanSummary(input: {
  status: string;
  issue: string | null;
  processorCode: string | null;
  processorText: string | null;
  origin: string;
  merchants: string[];
  recentAttempts: number;
  recentFailures: number;
  avs: string | null;
  cvv: string | null;
}) {
  const signals = [input.processorCode, input.issue].filter((value): value is string => Boolean(value));
  const likelyCause = input.status === "COMPLETED"
    ? "The recorded capture completed successfully."
    : input.processorText ?? input.processorCode ?? input.issue ?? "The capture failed; processor detail was not recorded.";
  const metadataGaps = [!input.avs && "AVS response", !input.cvv && "CVV response"].filter(Boolean) as string[];
  const failureRate = input.recentAttempts ? Math.round((input.recentFailures / input.recentAttempts) * 100) : 0;
  const trace = [
    { level: "INFO" as const, message: `Payment event ${input.status === "COMPLETED" ? "completed" : "recorded as failed"} for the latest order.`, reference: "CAPTURE_RESULT" },
    { level: "INFO" as const, message: `Order context matched · origin ${input.origin.toLowerCase()} · ${input.merchants.length ? input.merchants.join(", ") : "merchant not available"}.`, reference: "ORDER + MERCHANT" },
    { level: input.status === "FAILED" ? "WARN" as const : "INFO" as const, message: signals.length ? `Processor signals recorded · ${signals.join(" · ")}.` : "No processor response code was recorded for this event.", reference: "PROCESSOR RESPONSE" },
    { level: metadataGaps.length ? "WARN" as const : "INFO" as const, message: metadataGaps.length ? `Additional checks unavailable · ${metadataGaps.join(" and ")} not present in the stored event.` : `AVS ${input.avs} · CVV ${input.cvv}.`, reference: "AVS / CVV" },
    { level: input.recentFailures >= 5 && failureRate > 50 ? "WARN" as const : "INFO" as const, message: `Merchant window checked · ${input.recentAttempts} capture event(s), ${input.recentFailures} failure(s) in the last 15 minutes.`, reference: "15 MIN WINDOW" },
    { level: input.status === "COMPLETED" ? "SUCCESS" as const : "ALERT" as const, message: input.status === "COMPLETED" ? "Recorded result: payment completed. No intervention indicated by this event." : `Recorded result: payment failed. Review the processor response${input.origin === "AGENT" ? " and the linked human-review case" : " before contacting the customer"}.`, reference: "SCAN SUMMARY" },
  ];
  return {
    likelyCause,
    confidence: metadataGaps.length ? "Low" : input.status === "COMPLETED" ? "High" : "Medium",
    evidence: {
      processorCode: input.processorCode,
      processorText: input.processorText,
      issue: input.issue,
      avs: input.avs,
      cvv: input.cvv,
      recentAttempts: input.recentAttempts,
      recentFailures: input.recentFailures,
      failureRate,
      metadataGaps,
    },
    trace,
  };
}

export async function GET(request: Request) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const url = new URL(request.url);
  const afterTime = url.searchParams.get("afterTime");
  const afterId = url.searchParams.get("afterId");
  const cursorTime = afterTime ? new Date(afterTime) : null;
  if (afterTime && (!cursorTime || !Number.isFinite(cursorTime.getTime()) || !afterId)) {
    return NextResponse.json({ error: "The transaction cursor is invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const db = getDatabase();
  try {
    if (!db) {
      const [state, recent] = await Promise.all([getDemoState(), getOrderActivityList()]);
      const captured = recent.filter((order) => order.status === "PAID" || order.status === "FAILED");
      const afterIndex = afterId ? captured.findIndex((order) => order.id === afterId) : -1;
      const selected = afterId
        ? (afterIndex >= 0 ? captured.slice(0, afterIndex) : captured.slice(0, 30)).reverse()
        : captured.slice(0, 1);
      const events = selected.map((order) => {
        const issue = order.issue ?? null;
        const raw: RawFacts = { transactionId: order.transactionId };
        const merchants = [...new Set(order.items.map((item) => getMerchantForProduct(item.id).name))];
        const summary = scanSummary({ status: order.status, issue, processorCode: null, processorText: null, origin: order.origin ?? "UNKNOWN", merchants, recentAttempts: captured.length, recentFailures: captured.filter((item) => item.status === "FAILED").length, avs: null, cvv: null });
        return { eventId: order.id, createdAt: order.createdAt, orderId: order.id, amount: order.amount, status: order.status, issue, debugId: order.debug_id ?? null, transactionId: readString(raw.transactionId), simulated: true, origin: order.origin ?? "UNKNOWN", merchants, items: order.items, caseId: state.cases.find((item) => item.orderId === order.id)?.id ?? null, ...summary };
      });
      return NextResponse.json({ events, storage: "process-memory" }, { headers: { "Cache-Control": "no-store" } });
    }

    const where = afterTime && cursorTime && afterId
      ? { type: "CAPTURE_RESULT", OR: [{ createdAt: { gt: cursorTime } }, { createdAt: cursorTime, id: { gt: afterId } }] }
      : { type: "CAPTURE_RESULT" };
    let rows = await db.paymentEvent.findMany({
      where,
      orderBy: afterTime ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      take: afterTime ? 30 : 1,
      include: {
        order: {
          include: {
            items: { include: { product: { include: { merchant: { select: { id: true, name: true } } } } } },
            cases: { select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!afterTime) rows = [...rows].reverse();
    const chronologicalRows = rows;
    const windowStart = new Date(Date.now() - 15 * 60_000);
    const recentRows = await db.paymentEvent.findMany({
      where: { type: "CAPTURE_RESULT", createdAt: { gte: windowStart } },
      select: { paymentStatus: true, order: { select: { items: { select: { product: { select: { merchantId: true } } } } } } },
      take: 500,
    });
    const events = await Promise.all(chronologicalRows.map(async (event) => {
      const order = event.order;
      const merchants = [...new Map(order.items.map((item) => [item.product.merchant.id, item.product.merchant.name])).entries()].map(([id, name]) => ({ id, name }));
      const raw = mapRaw(event.rawJson);
      const merchantIds = new Set(merchants.map((merchant) => merchant.id));
      const recentForMerchant = recentRows.filter((row) => row.order.items.some((item) => merchantIds.has(item.product.merchantId)));
      const recentFailures = recentForMerchant.filter((row) => row.paymentStatus === "FAILED").length;
      const summary = scanSummary({
        status: event.paymentStatus ?? order.status,
        issue: event.issue,
        processorCode: readString(raw.processorResponseCode),
        processorText: readString(raw.processorResponseText),
        origin: order.checkoutOrigin,
        merchants: merchants.map((merchant) => merchant.name),
        recentAttempts: recentForMerchant.length,
        recentFailures,
        avs: readString(raw.avsPostalCodeResponseCode) ?? readString(raw.avsStreetAddressResponseCode),
        cvv: readString(raw.cvvResponseCode),
      });
      const scan = await db.liveTransactionScan.upsert({
        where: { eventId: event.id },
        create: { eventId: event.id, scanJson: summary as unknown as Prisma.InputJsonValue },
        update: {},
      });
      const storedSummary = mapRaw(scan.scanJson);
      return {
        eventId: event.id,
        createdAt: event.createdAt.toISOString(),
        orderId: order.id,
        amount: order.totalCents / 100,
        status: event.paymentStatus ?? order.status,
        issue: event.issue,
        debugId: event.debugId,
        transactionId: readString(raw.transactionId),
        simulated: event.simulated,
        origin: order.checkoutOrigin,
        merchants,
        items: order.items.map((item) => ({ id: item.productId, name: item.product.name, quantity: item.quantity })),
        caseId: order.cases[0]?.id ?? null,
        ...storedSummary,
      };
    }));
    return NextResponse.json({ events, storage: "neon-postgres" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Live transaction records could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
