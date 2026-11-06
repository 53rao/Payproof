import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";

const merchants = [{ id: "northstar", name: "Northstar Goods" }, { id: "fieldform", name: "Field & Form" }];
export async function GET() {
  const db = getDatabase();
  if (!db) { const { getDemoState } = await import("@/lib/demo-store"); const state = await getDemoState(); const merchantMetrics = "merchantAnalytics" in state ? state.merchantAnalytics : []; return NextResponse.json({ merchants: merchantMetrics, storage: "process-memory", simulated: true }, { headers: { "Cache-Control": "no-store" } }); }
  try {
    const result = await Promise.all(merchants.map(async (merchant) => {
      const productFilter = { items: { some: { product: { merchantId: merchant.id } } } };
      const [orders, failedPayments, events, released, held, recoveries] = await Promise.all([
        db.order.findMany({ where: productFilter, select: { id: true } }),
        db.order.count({ where: { ...productFilter, status: "FAILED" } }),
        db.paymentEvent.count({ where: { order: { is: productFilter } } }),
        db.stockReservation.aggregate({ where: { status: "RELEASED", product: { is: { merchantId: merchant.id } } }, _sum: { quantity: true } }),
        db.stockReservation.aggregate({ where: { status: "HELD", product: { is: { merchantId: merchant.id } } }, _sum: { quantity: true } }),
        db.order.findMany({ where: { ...productFilter, status: "PAID", recoveredFromOrderId: { not: null } }, select: { totalCents: true } }),
      ]);
      return { ...merchant, paymentEvents: events, failedPayments, recoveredStock: released._sum.quantity ?? 0, stuckStock: held._sum.quantity ?? 0, recoveredRevenue: recoveries.reduce((sum, order) => sum + order.totalCents / 100, 0), recoveredOrders: recoveries.length, orderCount: orders.length };
    }));
    return NextResponse.json({ merchants: result, storage: "database", simulated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Merchant analytics query failed:", error); return NextResponse.json({ error: "Merchant analytics could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
