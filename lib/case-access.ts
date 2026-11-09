import "server-only";
import { getMerchantSession, getOwnerSession } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { listOwnerCases } from "@/lib/customer-case-store";

export type CaseAccess = { owner: boolean; merchantId: string | null };

/**
 * Owners can open any case. Merchants can only open cases that belong to their
 * own catalog, so the same workspace can be reused by both portals.
 */
export async function getCaseAccess(caseId: string): Promise<CaseAccess | null> {
  const [owner, merchant] = await Promise.all([getOwnerSession(), getMerchantSession()]);
  if (owner) return { owner: true, merchantId: null };
  if (!merchant) return null;

  const db = getDatabase();
  if (!db) {
    const record = (await listOwnerCases()).find((item) => item.id === caseId);
    return record && record.merchantId === merchant.merchantId
      ? { owner: false, merchantId: merchant.merchantId }
      : null;
  }

  const record = await db.case.findUnique({
    where: { id: caseId },
    select: {
      order: {
        select: {
          items: { select: { product: { select: { merchantId: true } } } },
        },
      },
    },
  });
  if (!record) return null;

  const ownsCase = record.order.items.some((line) => line.product.merchantId === merchant.merchantId);
  return ownsCase ? { owner: false, merchantId: merchant.merchantId } : null;
}
