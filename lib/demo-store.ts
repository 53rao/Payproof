import { products } from "@/lib/products";
import { paymentProvider, type PaymentResult } from "@/lib/payment-provider";
import { getDatabase } from "@/db/client";
import { captureDatabaseOrder, createDatabaseOrder, getDatabaseDemoState, resetDatabaseDemo, setDatabaseProtection } from "@/lib/database-demo-store";

type OrderState = "PENDING" | "PROCESSING" | "PAID" | "FAILED";
type ReservationState = "HELD" | "RELEASED" | "COMMITTED";
type Order = { id: string; amount: number; items: { id: string; quantity: number }[]; status: OrderState; createdAt: string; payment?: PaymentResult; issue?: string; debug_id?: string; customerAccessTokenHash?: string; recoveredFromOrderId?: string; checkoutIssueType?: string; checkoutIssueDetails?: string };
type Reservation = { orderId: string; productId: string; quantity: number; state: ReservationState; expiresAt: number };
type CaseRecord = { id: string; orderId: string; issue: string; debug_id?: string; createdAt: string; status: "OPEN" | "CLOSED"; type?: string };
type Ledger = { idempotency: Record<string, { orderId: string; cart: string }>; orders: Order[]; reservations: Reservation[]; cases: CaseRecord[]; stock: Record<string, number>; protected: boolean; paymentEvents: number; failedPayments: number; recoveredStock: number; stuckStock: number };
const initialStock = () => Object.fromEntries(products.map((product) => [product.id, 12]));
const freshLedger = (): Ledger => ({ idempotency: {}, orders: [], reservations: [], cases: [], stock: initialStock(), protected: true, paymentEvents: 0, failedPayments: 0, recoveredStock: 0, stuckStock: 0 });
const globalStore = globalThis as typeof globalThis & { payproofDemoLedger?: Ledger; payproofCreateLocks?: Map<string, { cart: string; promise: Promise<{ id: string; amount: number; items: { id: string; quantity: number }[]; simulated: true; repeated?: boolean }> }> };
export type CustomerComplaintRecord = { id: string; caseId: string; orderId: string; type: string; originalText: string; createdAt: string; simulated: true };
const complaintStore = globalThis as typeof globalThis & { payproofCustomerComplaints?: CustomerComplaintRecord[] };
export const memoryComplaints = () => complaintStore.payproofCustomerComplaints ??= [];
function ledger() { globalStore.payproofDemoLedger ??= freshLedger(); return globalStore.payproofDemoLedger; }
export async function getDemoState() {
  if (getDatabase()) return getDatabaseDemoState();
  const state = ledger();
  const now = Date.now();
  const expired = new Map<string, Reservation[]>();
  for (const reservation of state.reservations) {
    if (reservation.state === "HELD" && reservation.expiresAt <= now && state.orders.find((order) => order.id === reservation.orderId)?.status === "PENDING") {
      expired.set(reservation.orderId, [...(expired.get(reservation.orderId) ?? []), reservation]);
    }
  }
  for (const [orderId, reservations] of expired) {
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order || order.status !== "PENDING") continue;
    order.status = "FAILED";
    order.issue = "RESERVATION_EXPIRED";
    state.failedPayments += 1;
    state.paymentEvents += 1;
    state.cases.push({ id: `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, orderId, issue: "RESERVATION_EXPIRED", createdAt: new Date().toISOString(), status: "OPEN" });
    for (const reservation of reservations) { reservation.state = "RELEASED"; state.stock[reservation.productId] += reservation.quantity; state.recoveredStock += reservation.quantity; }
  }
  const heldStock = Object.fromEntries(products.map((product) => [product.id, state.reservations.filter((item) => item.productId === product.id && item.state === "HELD").reduce((sum, item) => sum + item.quantity, 0)]));
  const committedStock = Object.fromEntries(products.map((product) => [product.id, state.reservations.filter((item) => item.productId === product.id && item.state === "COMMITTED").reduce((sum, item) => sum + item.quantity, 0)]));
  const recovered = state.orders.filter((order) => order.recoveredFromOrderId && order.status === "PAID");
  return { simulated: true, storage: "process-memory", protected: state.protected, stock: state.stock, heldStock, committedStock, orders: state.orders.slice(-12).reverse(), cases: state.cases.slice(-8).reverse(), counters: { paymentEvents: state.paymentEvents, failedPayments: state.failedPayments, recoveredStock: state.recoveredStock, stuckStock: state.stuckStock, openCases: state.cases.length, recoveredRevenue: recovered.reduce((sum, order) => sum + order.amount, 0), recoveredOrders: recovered.length } };
}
export async function setProtection(enabled: boolean) {
  if (getDatabase()) return setDatabaseProtection(enabled);
  ledger().protected = enabled; return getDemoState();
}
export async function resetDemo() {
  if (getDatabase()) return resetDatabaseDemo();
  globalStore.payproofDemoLedger = freshLedger(); return getDemoState();
}
export async function createDemoOrder(items: { id: string; quantity: number }[], idempotencyKey: string, customerAccessTokenHash: string, recoveredFromOrderId?: string) {
  if (getDatabase()) return createDatabaseOrder(items, idempotencyKey, customerAccessTokenHash, recoveredFromOrderId);
  await getDemoState();
  const state = ledger();
  const cart = JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
  const existing = state.idempotency[idempotencyKey];
  if (existing) {
    if (existing.cart !== cart) throw new Error("This checkout key was already used for a different cart.");
    const order = state.orders.find((candidate) => candidate.id === existing.orderId);
    if (order) { order.customerAccessTokenHash = customerAccessTokenHash; return { id: order.id, amount: order.amount, items: order.items, simulated: true as const, repeated: true }; }
  }
  const locks = globalStore.payproofCreateLocks ??= new Map();
  const inFlight = locks.get(idempotencyKey);
  if (inFlight) {
    if (inFlight.cart !== cart) throw new Error("This checkout key was already used for a different cart.");
    return inFlight.promise;
  }
  for (const item of items) if ((state.stock[item.id] ?? 0) < item.quantity) throw new Error(`Not enough ${products.find((p) => p.id === item.id)?.name ?? "stock"} available.`);
  // Reserve stock synchronously so parallel requests cannot oversell the same item.
  for (const item of items) state.stock[item.id] -= item.quantity;
  const promise = (async () => {
    try {
      const providerOrder = await paymentProvider.createOrder({ items, idempotencyKey });
      const isSimulated = !paymentProvider.isRealProvider();
      const order: Order = { ...providerOrder, items, status: "PENDING", createdAt: new Date().toISOString(), customerAccessTokenHash, recoveredFromOrderId };
      state.orders.push(order); state.idempotency[idempotencyKey] = { orderId: order.id, cart };
      for (const item of items) state.reservations.push({ orderId: order.id, productId: item.id, quantity: item.quantity, state: "HELD", expiresAt: Date.now() + 15 * 60 * 1000 });
      state.paymentEvents += 1;
      return { id: order.id, amount: order.amount, items, simulated: isSimulated };
    } catch (error) {
      for (const item of items) state.stock[item.id] += item.quantity;
      throw error;
    }
  })();
  locks.set(idempotencyKey, { cart, promise });
  try { return await promise; } finally { locks.delete(idempotencyKey); }
}
export async function captureDemoOrder(orderId: string, outcome: "success" | "decline" | "duplicate", issueType?: string, issueDetails?: string) {
  if (getDatabase()) return captureDatabaseOrder(orderId, outcome, issueType, issueDetails);
  await getDemoState();
  const state = ledger(); const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error("Order not found in the simulated ledger.");
  if (order.payment) return { payment: order.payment, state: await getDemoState() };
  if (order.status !== "PENDING") throw new Error("This simulated order is already being processed.");
  order.status = "PROCESSING";
  let payment: PaymentResult;
  try { payment = await paymentProvider.captureOrder(orderId, outcome); }
  catch (error) { order.status = "PENDING"; throw error; }
  order.payment = payment;
  if (payment.status === "FAILED") { order.checkoutIssueType = issueType; order.checkoutIssueDetails = issueDetails; }
  if (payment.status === "COMPLETED") {
    order.status = "PAID";
    for (const reservation of state.reservations.filter((item) => item.orderId === orderId && item.state === "HELD")) reservation.state = "COMMITTED";
  } else {
    order.status = "FAILED"; order.issue = payment.issue; order.debug_id = payment.debug_id; state.failedPayments += 1;
    state.cases.push({ id: `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, orderId, issue: payment.issue ?? "UNKNOWN", debug_id: payment.debug_id, createdAt: new Date().toISOString(), status: "OPEN" });
    const held = state.reservations.filter((item) => item.orderId === orderId && item.state === "HELD");
    if (state.protected) {
      for (const reservation of held) { state.stock[reservation.productId] += reservation.quantity; reservation.state = "RELEASED"; state.recoveredStock += reservation.quantity; }
    } else state.stuckStock += held.reduce((sum, item) => sum + item.quantity, 0);
  }
  state.paymentEvents += 1;
  return { payment, state: await getDemoState() };
}

export function findMemoryCustomerOrder(accessTokenHash: string, orderId?: string) {
  const order = ledger().orders.find((item) => item.customerAccessTokenHash === accessTokenHash && (!orderId || item.id === orderId));
  if (!order) return null;
  return { id: order.id, amount: order.amount, status: order.status, createdAt: order.createdAt, items: order.items.map((item) => ({ id: item.id, quantity: item.quantity })) };
}

export function listMemoryCustomerOrders(accessTokenHashes: string[]) {
  const hashes = new Set(accessTokenHashes);
  return ledger().orders.filter((item) => item.customerAccessTokenHash && hashes.has(item.customerAccessTokenHash)).map((order) => ({ id: order.id, amount: order.amount, status: order.status, createdAt: order.createdAt, items: order.items.map((item) => ({ id: item.id, quantity: item.quantity })) }));
}

export function closeMemoryCase(caseId: string) {
  const record = ledger().cases.find((item) => item.id === caseId);
  if (!record) return false;
  record.status = "CLOSED";
  return true;
}

export function createMemoryComplaint(accessTokenHash: string, orderId: string, type: string, originalText: string) {
  const order = ledger().orders.find((item) => item.customerAccessTokenHash === accessTokenHash && item.id === orderId);
  if (!order) return null;
  const now = new Date().toISOString();
  const caseId = `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const complaint = { id: crypto.randomUUID(), caseId, orderId, type, originalText, createdAt: now, simulated: true as const };
  memoryComplaints().unshift(complaint);
  ledger().cases.unshift({ id: caseId, orderId, issue: `Customer complaint · ${type}`, type: "CUSTOMER_COMPLAINT", createdAt: now, status: "OPEN" });
  return complaint;
}
