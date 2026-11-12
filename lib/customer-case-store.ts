import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";
import { createMemoryComplaint, listMemoryCustomerOrders, memoryComplaints } from "@/lib/demo-store";
import { hasMerchantCaseSubmission } from "@/lib/merchant-case-response";
import { DEMO_MERCHANTS, PRODUCT_TO_MERCHANT_ID } from "@/lib/merchants";

export const complaintTypes = ["ITEM_NOT_RECEIVED", "ITEM_DIFFERENT", "PAYMENT_ISSUE", "OTHER"] as const;
export type ComplaintType = typeof complaintTypes[number];

export async function listCustomerOrders(accessTokenHashes: string[]) {
  const db = getDatabase();
  if (!db) return listMemoryCustomerOrders(accessTokenHashes);
  if (!accessTokenHashes.length) return [];
  const orders = await db.order.findMany({ where: { customerAccessTokenHash: { in: accessTokenHashes } }, orderBy: { createdAt: "desc" }, take: 30, include: { items: { select: { productId: true, quantity: true } } } });
  return orders.map((order) => ({ id: order.id, amount: order.totalCents / 100, status: order.status, createdAt: order.createdAt.toISOString(), items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })) }));
}

export async function createComplaint(accessTokenHash: string, orderId: string, type: ComplaintType, originalText: string) {
  const db = getDatabase();
  if (!db) return createMemoryComplaint(accessTokenHash, orderId, type, originalText);
  const order = await db.order.findFirst({ where: { id: orderId, customerAccessTokenHash: accessTokenHash }, select: { id: true } });
  if (!order) return null;
  const caseId = `CASE-${randomUUID().slice(0, 8).toUpperCase()}`;
  const result = await db.$transaction(async (tx) => {
    const createdCase = await tx.case.create({ data: { id: caseId, orderId, type: "CUSTOMER_COMPLAINT", cause: "Customer submitted a complaint; merchant review is pending.", uncertainty: "The customer's statement is preserved verbatim. Store records may be incomplete; PayProof does not make payment dispute decisions.", status: "OPEN", simulated: true } });
    const complaint = await tx.customerComplaint.create({ data: { orderId, caseId: createdCase.id, type, originalText, simulated: true } });
    await tx.caseItem.create({ data: { caseId, kind: "customer_complaint", referenceId: complaint.id, completeness: "PRESENT", payload: { complaintType: type }, createdAt: complaint.createdAt } });
    return complaint;
  });
  return { id: result.id, caseId, orderId, type, originalText: result.originalText, createdAt: result.createdAt.toISOString(), simulated: true as const };
}

export async function listOwnerCases() {
  const db = getDatabase();
  if (!db) {
    const { getDemoState } = await import("@/lib/demo-store");
    const state = await getDemoState();
    const complaints = memoryComplaints();
    return Promise.all(state.cases.map(async (item) => { const order = state.orders.find((candidate) => candidate.id === item.orderId); const merchant = merchantForProducts(order?.items.map((line) => line.id) ?? []); return { id: item.id, orderId: item.orderId, type: ("type" in item ? item.type : undefined) ?? "PAYMENT_FAILURE", status: item.status, cause: item.issue, createdAt: item.createdAt, simulated: true, total: order?.amount, origin: order?.origin ?? "UNKNOWN", merchantId: merchant.id, merchantName: merchant.name, orderStatus: order?.status, responseSubmitted: await hasMerchantCaseSubmission(item.id), agentHandled: item.agentHandled ?? false, humanReviewRequired: item.humanReviewRequired ?? false, complaint: complaints.find((complaint) => complaint.caseId === item.id) ?? null, suggestedNextStep: item.agentHandled ? "Review the agent-handled decline." : ("type" in item ? item.type : undefined) === "CUSTOMER_COMPLAINT" ? "Compare the customer’s note with the order and payment records." : "Review the payment reference and processor response." }; }));
  }
  const cases = await db.case.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { complaint: { select: { id: true, type: true, originalText: true, createdAt: true } }, order: { select: { status: true, totalCents: true, checkoutOrigin: true, items: { select: { product: { select: { merchantId: true } } } } } } } });
  return Promise.all(cases.map(async (item) => { const merchant = merchantForId(item.order.items[0]?.product.merchantId); return { id: item.id, orderId: item.orderId, type: item.type, status: item.status, cause: item.cause, createdAt: item.createdAt.toISOString(), simulated: item.simulated, origin: item.order.checkoutOrigin, merchantId: merchant.id, merchantName: merchant.name, responseSubmitted: await hasMerchantCaseSubmission(item.id), agentHandled: item.agentHandled, humanReviewRequired: item.humanReviewRequired, orderStatus: item.order.status, total: item.order.totalCents / 100, suggestedNextStep: item.agentHandled ? "Review the agent-handled decline." : item.type === "CUSTOMER_COMPLAINT" ? "Compare the customer’s note with the order and payment records." : "Review the payment reference and processor response.", complaint: item.complaint ? { ...item.complaint, createdAt: item.complaint.createdAt.toISOString() } : null }; }));
}

const merchantForId = (merchantId: string | undefined) => DEMO_MERCHANTS.find((merchant) => merchant.id === merchantId) ?? DEMO_MERCHANTS[0];
const merchantForProducts = (productIds: string[]) => merchantForId(productIds.map((id) => PRODUCT_TO_MERCHANT_ID[id]).find(Boolean));

export async function updateOwnerCaseStatus(caseId: string, status: "OPEN" | "REVIEWED" | "CLOSED") {
  const db = getDatabase();
  if (!db) { const { updateMemoryCaseStatus } = await import("@/lib/demo-store"); return updateMemoryCaseStatus(caseId, status); }
  const result = await db.case.updateMany({ where: { id: caseId }, data: { status } });
  return result.count > 0;
}

export async function getOwnerCase(caseId: string) {
  const db = getDatabase();
  if (!db) {
    const { getCaseSnapshot } = await import("@/lib/case-assistant");
    return getCaseSnapshot(caseId);
  }
  return db.case.findUnique({
    where: { id: caseId },
    include: {
      complaint: true,
      report: { select: { body: true, updatedAt: true } },
      order: { include: { items: { include: { product: { select: { name: true } } } }, paymentEvents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, paymentStatus: true, issue: true, debugId: true, simulated: true, createdAt: true } } } },
      items: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, completeness: true, payload: true, createdAt: true } },
    },
  });
}

