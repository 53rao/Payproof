import { DEMO_MERCHANTS } from "@/lib/merchants";
import { paymentProvider, type PaymentResult } from "@/lib/payment-provider";
import { getDatabase } from "@/db/client";
import { captureDatabaseOrder, createDatabaseOrder, getDatabaseDemoState, getDatabaseOrderActivity, resetDatabaseDemo } from "@/lib/database-demo-store";

type OrderState = "PENDING" | "PROCESSING" | "PAID" | "FAILED";
export type CheckoutOrigin = "AGENT" | "HUMAN" | "UNKNOWN";
type Order = { id: string; amount: number; items: { id: string; quantity: number }[]; status: OrderState; createdAt: string; simulated: boolean; origin: CheckoutOrigin; payment?: PaymentResult; issue?: string; debug_id?: string; customerAccessTokenHash?: string; recoveredFromOrderId?: string; checkoutIssueType?: string; checkoutIssueDetails?: string };
type CaseRecord = { id: string; orderId: string; issue: string; debug_id?: string; createdAt: string; status: "OPEN" | "REVIEWED" | "CLOSED"; type?: string; agentHandled?: boolean; humanReviewRequired?: boolean };
type Ledger = { idempotency: Record<string, { orderId: string; cart: string }>; orders: Order[]; cases: CaseRecord[]; paymentEvents: number; failedPayments: number };
const freshLedger = (): Ledger => ({ idempotency: {}, orders: [], cases: [], paymentEvents: 0, failedPayments: 0 });
const globalStore = globalThis as typeof globalThis & { payproofDemoLedger?: Ledger; payproofCreateLocks?: Map<string, { cart: string; promise: Promise<{ id: string; amount: number; items: { id: string; quantity: number }[]; simulated: boolean; origin: CheckoutOrigin; repeated?: boolean }> }> };
export type CustomerComplaintRecord = { id: string; caseId: string; orderId: string; type: string; originalText: string; createdAt: string; simulated: true };
const complaintStore = globalThis as typeof globalThis & { payproofCustomerComplaints?: CustomerComplaintRecord[] };
export const memoryComplaints = () => complaintStore.payproofCustomerComplaints ??= [];
function ledger() { globalStore.payproofDemoLedger ??= freshLedger(); return globalStore.payproofDemoLedger; }
export async function getDemoState() {
  if (getDatabase()) return getDatabaseDemoState();
  const state = ledger();
  const recovered = state.orders.filter((order) => order.recoveredFromOrderId && order.status === "PAID");
  const merchantAnalytics = DEMO_MERCHANTS.map((merchant) => {
    const owns = (order: Order) => order.items.some((item) => merchant.products.includes(item.id));
    const orders = state.orders.filter(owns);
    const merchantCases = state.cases.filter((item) => item.status === "OPEN" && Boolean(state.orders.find((order) => order.id === item.orderId && owns(order))));
    const casesNeedingAction = merchantCases.filter((item) => item.type === "PAYMENT_FAILURE" && state.orders.find((order) => order.id === item.orderId)?.origin === "HUMAN").length;
    const recoveredOrders = orders.filter((order) => order.recoveredFromOrderId && order.status === "PAID");
    return { id: merchant.id, name: merchant.name, paymentEvents: orders.length + orders.reduce((sum, order) => sum + (order.payment ? 1 : 0), 0), failedPayments: orders.filter((order) => order.status === "FAILED").length, recoveredRevenue: recoveredOrders.reduce((sum, order) => sum + order.amount, 0), recoveredOrders: recoveredOrders.length, orderCount: new Set(orders.map((order) => order.id)).size, openCases: merchantCases.length, casesNeedingAction };
  });
  const openCases = state.cases.filter((item) => item.status === "OPEN");
  const caseOrderOrigin = (item: CaseRecord) => state.orders.find((order) => order.id === item.orderId)?.origin ?? "UNKNOWN";
  return { simulated: true, storage: "process-memory", orders: state.orders.slice(-12).reverse().map((order) => ({ ...order, transactionId: order.payment?.transaction_id, origin: order.origin ?? "UNKNOWN" })), cases: state.cases.slice(-8).reverse(), merchantAnalytics, counters: { paymentEvents: state.paymentEvents, failedPayments: state.failedPayments, openCases: openCases.length, agentFailureCases: openCases.filter((item) => item.type === "PAYMENT_FAILURE" && item.agentHandled).length, humanFailureCases: openCases.filter((item) => item.type === "PAYMENT_FAILURE" && caseOrderOrigin(item) === "HUMAN").length, recoveredRevenue: recovered.reduce((sum, order) => sum + order.amount, 0), recoveredOrders: recovered.length } };
}
export async function resetDemo() { if (getDatabase()) return resetDatabaseDemo(); globalStore.payproofDemoLedger = freshLedger(); return getDemoState(); }
export async function createDemoOrder(items: { id: string; quantity: number }[], idempotencyKey: string, customerAccessTokenHash: string, recoveredFromOrderId?: string, origin: CheckoutOrigin = "UNKNOWN") {
  if (getDatabase()) return createDatabaseOrder(items, idempotencyKey, customerAccessTokenHash, recoveredFromOrderId, origin);
  const state = ledger();
  const cart = JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
  const existing = state.idempotency[idempotencyKey];
  if (existing) {
    if (existing.cart !== cart) throw new Error("This checkout key was already used for a different cart.");
    const order = state.orders.find((candidate) => candidate.id === existing.orderId);
    if (order) { if ((order.origin ?? "UNKNOWN") !== origin) throw new Error("This checkout key was already used for a different checkout origin."); order.customerAccessTokenHash = customerAccessTokenHash; return { id: order.id, amount: order.amount, items: order.items, simulated: order.simulated, origin, repeated: true }; }
  }
  const locks = globalStore.payproofCreateLocks ??= new Map();
  const inFlight = locks.get(idempotencyKey);
  if (inFlight) { if (inFlight.cart !== cart) throw new Error("This checkout key was already used for a different cart."); return inFlight.promise; }
  const promise = (async () => {
    const providerOrder = await paymentProvider.createOrder({ items, idempotencyKey });
    const isSimulated = !paymentProvider.isRealProvider();
    const order: Order = { ...providerOrder, items, status: "PENDING", createdAt: new Date().toISOString(), simulated: isSimulated, customerAccessTokenHash, recoveredFromOrderId, origin };
    state.orders.push(order); state.idempotency[idempotencyKey] = { orderId: order.id, cart }; state.paymentEvents += 1;
    return { id: order.id, amount: order.amount, items, simulated: isSimulated, origin };
  })();
  locks.set(idempotencyKey, { cart, promise });
  try { return await promise; } finally { locks.delete(idempotencyKey); }
}
export async function captureDemoOrder(orderId: string, outcome: "success" | "decline" | "duplicate", paymentMethodNonce?: string, issueType?: string, issueDetails?: string, diagnosticScenario?: { type: string; label: string; expectedSignal: string }) {
  if (getDatabase()) return captureDatabaseOrder(orderId, outcome, paymentMethodNonce, issueType, issueDetails, diagnosticScenario);
  const state = ledger(); const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error("Order not found in the simulated ledger.");
  if (order.payment) return { payment: order.payment, state: await getDemoState() };
  if (order.status !== "PENDING") throw new Error("This simulated order is already being processed.");
  order.status = "PROCESSING";
  let payment: PaymentResult;
  try { payment = await paymentProvider.captureOrder(orderId, outcome, paymentMethodNonce); }
  catch (error) { order.status = "PENDING"; throw error; }
  order.payment = payment;
  if (diagnosticScenario) payment.raw = { ...payment.raw, diagnosticScenario };
  if (payment.status === "FAILED") { order.checkoutIssueType = issueType; order.checkoutIssueDetails = issueDetails; }
  if (payment.status === "COMPLETED") order.status = "PAID";
  else {
    order.status = "FAILED"; order.issue = payment.issue; order.debug_id = payment.debug_id; state.failedPayments += 1;
    const agentHandled = order.origin === "AGENT";
    state.cases.push({ id: `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, orderId, issue: payment.issue ?? "UNKNOWN", type: "PAYMENT_FAILURE", debug_id: payment.debug_id, createdAt: new Date().toISOString(), status: "OPEN", agentHandled, humanReviewRequired: agentHandled });
  }
  state.paymentEvents += 1;
  return { payment, state: await getDemoState() };
}
export function listMemoryCustomerOrders(accessTokenHashes: string[]) { const hashes = new Set(accessTokenHashes); return ledger().orders.filter((item) => item.customerAccessTokenHash && hashes.has(item.customerAccessTokenHash)).map((order) => ({ id: order.id, amount: order.amount, status: order.status, createdAt: order.createdAt, items: order.items.map((item) => ({ id: item.id, quantity: item.quantity })) })); }
export function closeMemoryCase(caseId: string) { const record = ledger().cases.find((item) => item.id === caseId); if (!record) return false; record.status = "CLOSED"; return true; }
export function updateMemoryCaseStatus(caseId: string, status: "OPEN" | "REVIEWED" | "CLOSED") { const record = ledger().cases.find((item) => item.id === caseId); if (!record) return false; record.status = status; return true; }
export function createMemoryComplaint(accessTokenHash: string, orderId: string, type: string, originalText: string) {
  const order = ledger().orders.find((item) => item.customerAccessTokenHash === accessTokenHash && item.id === orderId);
  if (!order) return null;
  const now = new Date().toISOString(); const caseId = `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const complaint = { id: crypto.randomUUID(), caseId, orderId, type, originalText, createdAt: now, simulated: true as const };
  memoryComplaints().unshift(complaint); ledger().cases.unshift({ id: caseId, orderId, issue: `Customer complaint · ${type}`, type: "CUSTOMER_COMPLAINT", createdAt: now, status: "OPEN" }); return complaint;
}
export async function getOrderActivityList() {
  if (getDatabase()) return getDatabaseOrderActivity();
  const state = ledger(); const casesByOrderId = new Map<string, (typeof state.cases)[number]>();
  for (const c of state.cases) if (!casesByOrderId.has(c.orderId)) casesByOrderId.set(c.orderId, c);
  return state.orders.map((order) => { const linkedCase = casesByOrderId.get(order.id); return { id: order.id, amount: order.amount, status: order.status, createdAt: order.createdAt, origin: order.origin ?? "UNKNOWN", transactionId: order.payment?.transaction_id, issue: order.issue ?? order.payment?.issue, debug_id: order.debug_id ?? order.payment?.debug_id, items: order.items, case: linkedCase ? { id: linkedCase.id, status: linkedCase.status, issue: linkedCase.issue } : undefined }; }).reverse();
}
