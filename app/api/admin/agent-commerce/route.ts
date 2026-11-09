import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { hasOwnerSession } from "@/lib/auth";
import { DEMO_MERCHANTS } from "@/lib/merchants";

const noStore = { "Cache-Control": "no-store" };

const emptyBody = {
  totalAgentOrders: 0,
  failedAgentOrders: 0,
  agentFailureRate: 0,
  casesCreated: 0,
  merchantBreakdown: [],
};

function failureRate(failed: number, total: number) {
  return total ? Math.round((failed / total) * 1000) / 10 : 0;
}

export async function GET() {
  if (!await hasOwnerSession()) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: noStore });
  }

  const db = getDatabase();
  if (!db) return NextResponse.json(emptyBody, { headers: noStore });

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [orders, merchants] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, checkoutOrigin: "AGENT" },
        select: {
          status: true,
          items: { select: { product: { select: { merchantId: true } } } },
          paymentEvents: { select: { paymentStatus: true } },
          cases: { select: { status: true } },
        },
      }),
      db.merchant.findMany({ select: { id: true, name: true } }),
    ]);

    const names = new Map<string, string>(
      (merchants.length ? merchants : DEMO_MERCHANTS).map((merchant) => [merchant.id, merchant.name] as [string, string]),
    );

    let failedAgentOrders = 0;
    let casesCreated = 0;
    const perMerchant = new Map<string, { total: number; failed: number; openCases: number }>();

    for (const order of orders) {
      const failed = order.status === "FAILED" || order.paymentEvents.some((event) => event.paymentStatus === "FAILED");
      if (failed) failedAgentOrders += 1;
      if (failed) casesCreated += order.cases.length;
      const openCases = order.cases.filter((item) => item.status !== "CLOSED").length;
      const merchantIds = [...new Set(order.items.map((item) => item.product.merchantId).filter(Boolean))];
      for (const merchantId of merchantIds) {
        const entry = perMerchant.get(merchantId) ?? { total: 0, failed: 0, openCases: 0 };
        entry.total += 1;
        if (failed) entry.failed += 1;
        entry.openCases += openCases;
        perMerchant.set(merchantId, entry);
      }
    }

    const merchantBreakdown = [...perMerchant.entries()]
      .map(([merchantId, entry]) => ({
        merchantId,
        merchantName: names.get(merchantId) ?? merchantId,
        total: entry.total,
        failed: entry.failed,
        failureRate: failureRate(entry.failed, entry.total),
        openCases: entry.openCases,
      }))
      .sort((a, b) => b.failureRate - a.failureRate || b.total - a.total || a.merchantName.localeCompare(b.merchantName));

    return NextResponse.json({
      totalAgentOrders: orders.length,
      failedAgentOrders,
      agentFailureRate: failureRate(failedAgentOrders, orders.length),
      casesCreated,
      merchantBreakdown,
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Agent commerce could not be loaded." }, { status: 503, headers: noStore });
  }
}
