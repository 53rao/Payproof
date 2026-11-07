import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { getDemoState } from "@/lib/demo-store";
import { detectIncidents } from "@/lib/incident-detector";
import { DEMO_MERCHANTS } from "@/lib/merchants";
import { products as catalogProducts } from "@/lib/products";

export async function GET() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "Merchant sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { merchantId } = session;
  const db = getDatabase();

  try {
    if (db) {
      const merchant = await db.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, name: true, email: true },
      });

      const ownedProducts = await db.product.findMany({
        where: { merchantId },
        select: { id: true, name: true, priceCents: true },
      });
      const ownedProductIds = ownedProducts.map((p) => p.id);

      const orders = await db.order.findMany({
        where: {
          items: { some: { productId: { in: ownedProductIds } } },
        },
        include: {
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const totalOrders = orders.length;
      const failedOrders = orders.filter((o) => o.status === "FAILED").length;
      const failureRate = totalOrders > 0 ? Math.round((failedOrders / totalOrders) * 100) : 0;

      const openCases = await db.case.findMany({
        where: {
          status: "OPEN",
          order: { items: { some: { productId: { in: ownedProductIds } } } },
        },
        include: {
          order: {
            include: { items: { include: { product: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const formattedCases = openCases.map((c) => {
        const item = c.order.items.find((i) => ownedProductIds.includes(i.productId)) ?? c.order.items[0];
        const productName = item?.product.name ?? "Store item";
        const needsAction = c.type === "PAYMENT_FAILURE" && c.order.checkoutOrigin === "HUMAN";
        return {
          id: c.id,
          orderId: c.orderId,
          status: c.status,
          type: c.type,
          cause: c.cause,
          productName,
          origin: c.order.checkoutOrigin,
          amount: c.order.totalCents / 100,
          createdAt: c.createdAt.toISOString(),
          needsAction,
        };
      });

      const casesNeedingActionCount = formattedCases.filter((c) => c.needsAction).length;

      const allIncidents = await detectIncidents();
      const merchantIncidents = allIncidents
        .filter((i) => i.merchantId === merchantId)
        .map((i) => ({
          id: i.id,
          type: i.type,
          summary: i.summary,
          detail: i.detail,
          confidence: i.confidence,
          detectedAt: i.detectedAt,
        }));

      return NextResponse.json({
        merchant: {
          id: merchant?.id ?? merchantId,
          name: merchant?.name ?? session.merchantName,
          email: merchant?.email ?? session.email,
        },
        summary: {
          totalOrders,
          failedOrders,
          failureRate,
        },
        cases: formattedCases,
        casesNeedingActionCount,
        incidents: merchantIncidents,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // In-memory fallback
    const state = await getDemoState();
    const demoMerchant = DEMO_MERCHANTS.find((candidate) => candidate.id === merchantId);
    const ownedProductIds = demoMerchant?.products ?? [];
    const merchantName = demoMerchant?.name ?? session.merchantName;
    const merchantEmail = session.email;

    const orders = state.orders.filter((o) => o.items.some((i) => ownedProductIds.includes(i.id)));
    const totalOrders = orders.length;
    const failedOrders = orders.filter((o) => o.status === "FAILED").length;
    const failureRate = totalOrders > 0 ? Math.round((failedOrders / totalOrders) * 100) : 0;

    const openCases = state.cases
      .filter((c) => c.status === "OPEN")
      .filter((c) => {
        const order = state.orders.find((o) => o.id === c.orderId);
        return order && order.items.some((i) => ownedProductIds.includes(i.id));
      });

    const formattedCases = openCases.map((c) => {
      const order = state.orders.find((o) => o.id === c.orderId);
      const item = order?.items.find((i) => ownedProductIds.includes(i.id)) ?? order?.items[0];
      const product = catalogProducts.find((p) => p.id === item?.id);
      const needsAction = Boolean(order && order.origin === "HUMAN" && order.status === "FAILED");
      return {
        id: c.id,
        orderId: c.orderId,
        status: c.status,
        type: "PAYMENT_FAILURE",
        cause: c.issue,
        productName: product?.name ?? "Store item",
        origin: order?.origin ?? "UNKNOWN",
        amount: order?.amount ?? 0,
        createdAt: c.createdAt,
        needsAction,
      };
    });

    const casesNeedingActionCount = formattedCases.filter((c) => c.needsAction).length;
    const allIncidents = await detectIncidents();
    const merchantIncidents = allIncidents
      .filter((i) => i.merchantId === merchantId)
      .map((i) => ({
        id: i.id,
        type: i.type,
        summary: i.summary,
        detail: i.detail,
        confidence: i.confidence,
        detectedAt: i.detectedAt,
      }));

    return NextResponse.json({
      merchant: {
        id: merchantId,
        name: merchantName,
        email: merchantEmail,
      },
      summary: {
        totalOrders,
        failedOrders,
        failureRate,
      },
      cases: formattedCases,
      casesNeedingActionCount,
      incidents: merchantIncidents,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Merchant dashboard error:", error);
    return NextResponse.json(
      { error: "Could not load merchant dashboard data." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
