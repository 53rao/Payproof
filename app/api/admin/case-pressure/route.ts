import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { hasOwnerSession } from "@/lib/auth";
import { DEMO_MERCHANTS } from "@/lib/merchants";

const noStore = { "Cache-Control": "no-store" };

const emptyBody = { totalOpenCases: 0, merchants: [] };

export async function GET() {
  if (!await hasOwnerSession()) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: noStore });
  }

  const db = getDatabase();
  if (!db) return NextResponse.json(emptyBody, { headers: noStore });

  try {
    const [cases, merchants] = await Promise.all([
      db.case.findMany({
        where: { status: { not: "CLOSED" } },
        select: {
          status: true,
          createdAt: true,
          order: {
            select: {
              checkoutOrigin: true,
              items: { select: { product: { select: { merchantId: true } } } },
            },
          },
        },
      }),
      db.merchant.findMany({ select: { id: true, name: true } }),
    ]);

    const names = new Map<string, string>(
      (merchants.length ? merchants : DEMO_MERCHANTS).map((merchant) => [merchant.id, merchant.name] as [string, string]),
    );

    const perMerchant = new Map<string, { openCases: number; oldestCaseAt: number; humanCasesNeedingAction: number }>();

    for (const item of cases) {
      const merchantIds = [...new Set(item.order.items.map((row) => row.product.merchantId).filter(Boolean))];
      if (!merchantIds.length) continue;
      const createdAt = item.createdAt.getTime();
      for (const merchantId of merchantIds) {
        const entry = perMerchant.get(merchantId) ?? { openCases: 0, oldestCaseAt: createdAt, humanCasesNeedingAction: 0 };
        entry.openCases += 1;
        entry.oldestCaseAt = Math.min(entry.oldestCaseAt, createdAt);
        if (item.status === "OPEN" && item.order.checkoutOrigin === "HUMAN") entry.humanCasesNeedingAction += 1;
        perMerchant.set(merchantId, entry);
      }
    }

    const now = Date.now();
    const merchantRows = [...perMerchant.entries()]
      .map(([merchantId, entry]) => ({
        merchantId,
        merchantName: names.get(merchantId) ?? merchantId,
        openCases: entry.openCases,
        oldestCaseAgeHours: Math.max(0, Math.round((now - entry.oldestCaseAt) / (60 * 60 * 1000))),
        humanCasesNeedingAction: entry.humanCasesNeedingAction,
      }))
      .sort((a, b) => b.oldestCaseAgeHours - a.oldestCaseAgeHours || b.openCases - a.openCases);

    return NextResponse.json({ totalOpenCases: cases.length, merchants: merchantRows }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Case pressure could not be loaded." }, { status: 503, headers: noStore });
  }
}
