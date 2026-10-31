import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";
import { createMemoryComplaint, listMemoryCustomerOrders, memoryComplaints } from "@/lib/demo-store";

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
    const createdCase = await tx.case.create({ data: { id: caseId, orderId, type: "CUSTOMER_COMPLAINT", cause: "Customer submitted a complaint; merchant review is pending.", uncertainty: "The customer's statement is preserved verbatim. Store records may be incomplete; PayPal makes any dispute decision.", status: "OPEN", simulated: true } });
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
    return state.cases.map((item) => ({ id: item.id, orderId: item.orderId, type: ("type" in item ? item.type : undefined) ?? "PAYMENT_FAILURE", status: item.status, cause: item.issue, createdAt: item.createdAt, simulated: true, total: state.orders.find((order) => order.id === item.orderId)?.amount, complaint: complaints.find((complaint) => complaint.caseId === item.id) ?? null, suggestedNextStep: ("type" in item ? item.type : undefined) === "CUSTOMER_COMPLAINT" ? "Compare the customer’s note with the order and fulfillment records." : "Check the payment reference and reservation state." }));
  }
  const cases = await db.case.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { complaint: { select: { id: true, type: true, originalText: true, createdAt: true } }, order: { select: { status: true, totalCents: true } } } });
  return cases.map((item) => ({ id: item.id, orderId: item.orderId, type: item.type, status: item.status, cause: item.cause, createdAt: item.createdAt.toISOString(), simulated: item.simulated, orderStatus: item.order.status, total: item.order.totalCents / 100, suggestedNextStep: item.type === "CUSTOMER_COMPLAINT" ? "Compare the customer’s note with the order and fulfillment records." : "Check the payment reference and reservation state.", complaint: item.complaint ? { ...item.complaint, createdAt: item.complaint.createdAt.toISOString() } : null }));
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
      order: { include: { items: { include: { product: { select: { name: true } } } }, reservations: { include: { product: { select: { name: true } } }, orderBy: { createdAt: "asc" } }, paymentEvents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, paymentStatus: true, issue: true, debugId: true, simulated: true, createdAt: true } } } },
      items: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, completeness: true, payload: true, createdAt: true } },
    },
  });
}

