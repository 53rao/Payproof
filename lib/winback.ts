import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/db/client";
import { products } from "@/lib/products";
import { createDemoOrder, getDemoState } from "@/lib/demo-store";

const ttl = 7 * 24 * 60 * 60 * 1000;
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("Recovery links require SESSION_SECRET.");
  return value;
}
export function createRecoveryToken(caseId: string) {
  const payload = Buffer.from(JSON.stringify({ caseId, expiresAt: Date.now() + ttl })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyRecoveryToken(token: string) {
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(supplied, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { caseId?: unknown; expiresAt?: unknown };
    if (typeof value.caseId !== "string" || !/^CASE-[A-Z0-9-]{4,40}$/.test(value.caseId) || typeof value.expiresAt !== "number" || value.expiresAt < Date.now()) return null;
    return { caseId: value.caseId, expiresAt: value.expiresAt };
  } catch { return null; }
}

export async function getRecoveryOrder(caseId: string) {
  const db = getDatabase();
  if (db) {
    const item = await db.case.findUnique({ where: { id: caseId }, include: { order: { include: { items: { include: { product: true } } } } } });
    if (!item) return null;
    return { caseId, orderId: item.orderId, status: item.order.status, total: item.order.totalCents / 100, items: item.order.items.map((row) => ({ id: row.productId, name: row.product.name, quantity: row.quantity, unitPrice: row.unitPriceCents / 100 })) };
  }
  const state = await getDemoState();
  const caseRecord = state.cases.find((item) => item.id === caseId);
  const order = caseRecord && state.orders.find((item) => item.id === caseRecord.orderId);
  if (!caseRecord || !order) return null;
  return { caseId, orderId: order.id, status: order.status, total: order.amount, items: order.items.map((row) => { const product = products.find((item) => item.id === row.id); return { id: row.id, name: product?.name ?? "Store item", quantity: row.quantity, unitPrice: product?.price ?? 0 }; }) };
}

export async function createRecoveryOrder(token: string, caseId: string) {
  const original = await getRecoveryOrder(caseId);
  if (!original || original.status !== "FAILED") return null;
  const idempotency = `RECOVERY-${createHash("sha256").update(token).digest("hex")}`;
  const customerTokenHash = createHash("sha256").update(idempotency).digest("hex");
  const order = await createDemoOrder(original.items.map(({ id, quantity }) => ({ id, quantity })), idempotency, customerTokenHash, original.orderId);
  return { ...order, originalOrderId: original.orderId, customerToken: idempotency, simulated: true as const };
}
