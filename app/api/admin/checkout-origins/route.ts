import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { hasOwnerSession } from "@/lib/auth";
import { DEMO_MERCHANTS } from "@/lib/merchants";

const ORIGINS = ["HUMAN", "AGENT", "UNKNOWN"] as const;
type Origin = typeof ORIGINS[number];
type Counts = Record<Origin, number>;

const emptyCounts = (): Counts => ({ HUMAN: 0, AGENT: 0, UNKNOWN: 0 });

function originOf(value: string): Origin {
  return value === "HUMAN" || value === "AGENT" ? value : "UNKNOWN";
}

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!await hasOwnerSession()) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: noStore });
  }

  const db = getDatabase();
  if (!db) {
    return NextResponse.json({ totals: { ...emptyCounts(), total: 0 }, byMerchant: [] }, { headers: noStore });
  }

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [orders, merchants] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since } },
        select: {
          checkoutOrigin: true,
          items: { select: { product: { select: { merchantId: true } } } },
        },
      }),
      db.merchant.findMany({ select: { id: true, name: true } }),
    ]);

    const names = new Map<string, string>(
      (merchants.length ? merchants : DEMO_MERCHANTS).map((merchant) => [merchant.id, merchant.name] as [string, string]),
    );

    const totals = emptyCounts();
    const perMerchant = new Map<string, Counts>();

    for (const order of orders) {
      const origin = originOf(order.checkoutOrigin);
      totals[origin] += 1;
      const merchantIds = [...new Set(order.items.map((item) => item.product.merchantId).filter(Boolean))];
      for (const merchantId of merchantIds) {
        const counts = perMerchant.get(merchantId) ?? emptyCounts();
        counts[origin] += 1;
        perMerchant.set(merchantId, counts);
      }
    }

    const byMerchant = [...perMerchant.entries()]
      .map(([merchantId, counts]) => ({
        merchantId,
        merchantName: names.get(merchantId) ?? merchantId,
        ...counts,
      }))
      .sort((a, b) => {
        const totalDifference = (b.HUMAN + b.AGENT + b.UNKNOWN) - (a.HUMAN + a.AGENT + a.UNKNOWN);
        return totalDifference || a.merchantName.localeCompare(b.merchantName);
      });

    return NextResponse.json({ totals: { ...totals, total: orders.length }, byMerchant }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Checkout origins could not be loaded." }, { status: 503, headers: noStore });
  }
}
