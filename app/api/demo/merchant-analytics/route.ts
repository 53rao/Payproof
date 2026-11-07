import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { DEMO_MERCHANTS } from "@/lib/merchants";

export async function GET() {
  const db = getDatabase();
  if (!db) {
    const { getDemoState } = await import("@/lib/demo-store");
    const state = await getDemoState();
    const merchantMetrics = "merchantAnalytics" in state ? state.merchantAnalytics : [];
    return NextResponse.json(
      { merchants: merchantMetrics, uniquePaymentEvents: state.counters.paymentEvents, storage: "process-memory", simulated: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const dbMerchants = await db.merchant.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const merchants = dbMerchants.length > 0 ? dbMerchants : DEMO_MERCHANTS;

    const [result, uniquePaymentEvents] = await Promise.all([
      Promise.all(merchants.map(async (merchant) => {
        const productFilter = { items: { some: { product: { merchantId: merchant.id } } } };
        const [orders, failedPayments, events, released, held, recoveries, openCases, casesNeedingAction] = await Promise.all([
          db.order.findMany({ where: productFilter, select: { id: true } }),
          db.order.count({ where: { ...productFilter, status: "FAILED" } }),
          db.paymentEvent.count({ where: { order: { is: productFilter } } }),
          db.stockReservation.aggregate({ where: { status: "RELEASED", product: { is: { merchantId: merchant.id } } }, _sum: { quantity: true } }),
          db.stockReservation.aggregate({ where: { status: "HELD", product: { is: { merchantId: merchant.id } } }, _sum: { quantity: true } }),
          db.order.findMany({ where: { ...productFilter, status: "PAID", recoveredFromOrderId: { not: null } }, select: { totalCents: true } }),
          db.case.count({ where: { status: "OPEN", order: { is: productFilter } } }),
          db.case.count({ where: { status: "OPEN", type: "PAYMENT_FAILURE", order: { is: { ...productFilter, checkoutOrigin: "HUMAN" } } } }),
        ]);
        return {
          ...merchant,
          paymentEvents: events,
          failedPayments,
          recoveredStock: released._sum.quantity ?? 0,
          stuckStock: held._sum.quantity ?? 0,
          recoveredRevenue: recoveries.reduce((sum, order) => sum + order.totalCents / 100, 0),
          recoveredOrders: recoveries.length,
          orderCount: orders.length,
          openCases,
          casesNeedingAction,
        };
      })),
      db.paymentEvent.count(),
    ]);
    return NextResponse.json(
      { merchants: result, uniquePaymentEvents, storage: "database", simulated: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Merchant analytics query failed:", error);
    return NextResponse.json({ error: "Merchant analytics could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
