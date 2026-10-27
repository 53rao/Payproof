import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { products } from "@/lib/products";
import { paymentProvider } from "@/lib/payment-provider";
import { getDatabase } from "@/db/client";

type CartLine = { id: string; quantity: number };
const initialStock = 12;
const cartFingerprint = (items: CartLine[]) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
const isUniqueConflict = (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "P2002";
const runtime = globalThis as typeof globalThis & {
  payproofSeedCheck?: { connection: string; promise: Promise<void> };
  payproofExpirySweep?: { at: number; promise?: Promise<void> };
};

async function ensureSeeded() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to seed the database.");
  const connection = process.env.DATABASE_URL ?? "";
  if (runtime.payproofSeedCheck?.connection === connection) return runtime.payproofSeedCheck.promise;
  const promise = (async () => {
    const marker = await db.order.findUnique({ where: { id: "DEMO-ORDER-PAID" }, select: { id: true } });
    if (!marker) await seedDatabase();
  })();
  runtime.payproofSeedCheck = { connection, promise };
  try { await promise; }
  catch (error) { if (runtime.payproofSeedCheck?.promise === promise) runtime.payproofSeedCheck = undefined; throw error; }
}

export async function seedDatabase() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to seed the database.");

  await db.product.createMany({
    data: products.map((product) => ({ id: product.id, name: product.name, priceCents: product.price * 100, initialStock, availableStock: initialStock, simulated: true })),
    skipDuplicates: true,
  });
  await db.protectionSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true }, update: {} });
  // Seed-only marker. This is not a usable password hash or a demo login.
  await db.owner.upsert({
    where: { email: "demo-owner@example.test" },
    create: { id: "00000000-0000-4000-8000-000000000001", email: "demo-owner@example.test", passwordHash: "seed-only-unusable-password-hash" },
    update: {},
  });

  const fixtures = [
    { id: "DEMO-ORDER-PAID", key: "seed:v1:paid", productId: "mug", quantity: 1, status: "PAID" as const, totalCents: 2800, createdAt: new Date("2026-10-26T09:15:00.000Z"), reservation: "COMMITTED" as const },
    { id: "DEMO-ORDER-FAILED", key: "seed:v1:failed", productId: "candle", quantity: 1, status: "FAILED" as const, totalCents: 3200, createdAt: new Date("2026-10-26T10:42:00.000Z"), reservation: "RELEASED" as const },
    { id: "DEMO-ORDER-PENDING", key: "seed:v1:pending", productId: "tote", quantity: 1, status: "PENDING" as const, totalCents: 3600, createdAt: new Date("2026-10-27T08:30:00.000Z"), reservation: "HELD" as const },
  ];

  for (const order of fixtures) {
    const created = await db.order.createMany({
      data: [{ id: order.id, idempotencyKey: order.key, cartFingerprint: cartFingerprint([{ id: order.productId, quantity: order.quantity }]), totalCents: order.totalCents, status: order.status, simulated: true, createdAt: order.createdAt }],
      skipDuplicates: true,
    });
    if (created.count > 0 && (order.reservation === "COMMITTED" || order.reservation === "HELD")) {
      await db.product.update({ where: { id: order.productId }, data: { availableStock: { decrement: order.quantity } } });
    }
    await db.orderItem.createMany({ data: [{ orderId: order.id, productId: order.productId, quantity: order.quantity, unitPriceCents: order.totalCents }], skipDuplicates: true });
    await db.stockReservation.createMany({
      data: [{ orderId: order.id, productId: order.productId, quantity: order.quantity, status: order.reservation, expiresAt: order.reservation === "HELD" ? new Date(Date.now() + 60 * 60 * 1000) : null, createdAt: order.createdAt }],
      skipDuplicates: true,
    });
  }

  await db.paymentEvent.createMany({
    data: [
      { id: "10000000-0000-4000-8000-000000000001", orderId: "DEMO-ORDER-PAID", type: "ORDER_CREATED", paymentStatus: "PENDING", rawJson: { provider: "MockProvider", seeded: true }, createdAt: new Date("2026-10-26T09:15:00.000Z") },
      { id: "10000000-0000-4000-8000-000000000002", orderId: "DEMO-ORDER-PAID", type: "CAPTURE_RESULT", paymentStatus: "COMPLETED", debugId: "SIM-DBG-PAID-001", rawJson: { provider: "MockProvider", seeded: true }, createdAt: new Date("2026-10-26T09:15:04.000Z") },
      { id: "10000000-0000-4000-8000-000000000003", orderId: "DEMO-ORDER-FAILED", type: "ORDER_CREATED", paymentStatus: "PENDING", rawJson: { provider: "MockProvider", seeded: true }, createdAt: new Date("2026-10-26T10:42:00.000Z") },
      { id: "10000000-0000-4000-8000-000000000004", orderId: "DEMO-ORDER-FAILED", type: "CAPTURE_RESULT", paymentStatus: "FAILED", issue: "INSTRUMENT_DECLINED", debugId: "SIM-DBG-DECLINE-001", rawJson: { provider: "MockProvider", seeded: true, note: "Fictional seeded decline" }, createdAt: new Date("2026-10-26T10:42:05.000Z") },
      { id: "10000000-0000-4000-8000-000000000005", orderId: "DEMO-ORDER-PENDING", type: "ORDER_CREATED", paymentStatus: "PENDING", rawJson: { provider: "MockProvider", seeded: true }, createdAt: new Date("2026-10-27T08:30:00.000Z") },
    ],
    skipDuplicates: true,
  });

  const failureCaseId = "CASE-DEMO-DECLINE";
  await db.case.createMany({
    data: [{ id: failureCaseId, orderId: "DEMO-ORDER-FAILED", type: "PAYMENT_FAILURE", status: "OPEN", cause: "The simulated payment provider returned INSTRUMENT_DECLINED.", uncertainty: "This fictional provider result does not establish customer intent.", simulated: true, createdAt: new Date("2026-10-26T10:42:06.000Z") }],
    skipDuplicates: true,
  });
  await db.caseItem.createMany({
    data: [
      { id: "20000000-0000-4000-8000-000000000001", caseId: failureCaseId, kind: "order", referenceId: "DEMO-ORDER-FAILED", completeness: "PRESENT", payload: { orderId: "DEMO-ORDER-FAILED", totalCents: 3200 } },
      { id: "20000000-0000-4000-8000-000000000002", caseId: failureCaseId, kind: "payment_event", referenceId: "DEMO-ORDER-FAILED", completeness: "PRESENT", payload: { issue: "INSTRUMENT_DECLINED", debug_id: "SIM-DBG-DECLINE-001" } },
      { id: "20000000-0000-4000-8000-000000000003", caseId: failureCaseId, kind: "stock_reservation", referenceId: "DEMO-ORDER-FAILED", completeness: "RELEASED", payload: { units: 1 } },
      { id: "20000000-0000-4000-8000-000000000004", caseId: failureCaseId, kind: "fulfillment", completeness: "MISSING", payload: { note: "No fulfillment integration is connected in this demo." } },
    ],
    skipDuplicates: true,
  });
  await db.customerComplaint.createMany({
    data: [{ id: "50000000-0000-4000-8000-000000000001", orderId: "DEMO-ORDER-FAILED", caseId: failureCaseId, type: "PAYMENT_ISSUE", originalText: "I see a charge on my card for this order, but checkout showed a payment issue. Can you check whether it went through?", simulated: true, createdAt: new Date("2026-10-26T10:45:00.000Z") }],
    skipDuplicates: true,
  });
  await db.caseItem.createMany({
    data: [{ id: "20000000-0000-4000-8000-000000000005", caseId: failureCaseId, kind: "customer_complaint", referenceId: "50000000-0000-4000-8000-000000000001", completeness: "PRESENT", payload: { complaintType: "PAYMENT_ISSUE", simulated: true }, createdAt: new Date("2026-10-26T10:45:00.000Z") }],
    skipDuplicates: true,
  });
  await db.aiDraft.createMany({
    data: [{ id: "30000000-0000-4000-8000-000000000001", caseId: failureCaseId, kind: "customer_status_update", body: "We could not complete the payment for your order. Please check your payment method or try again. Your items are available while we resolve this.", simulated: true }],
    skipDuplicates: true,
  });
  await db.demoRun.createMany({
    data: [{ id: "40000000-0000-4000-8000-000000000001", startedAt: new Date("2026-10-26T09:00:00.000Z"), endedAt: new Date("2026-10-26T11:00:00.000Z"), simulated: true }],
    skipDuplicates: true,
  });
  const activeRun = await db.demoRun.findFirst({ where: { endedAt: null }, select: { id: true } });
  if (!activeRun) await db.demoRun.create({ data: { simulated: true } });

  const [productCount, ownerCount, orderCount, orderItemCount, reservationCount, eventCount, caseCount, caseItemCount, draftCount, settingsCount, runCount] = await Promise.all([
    db.product.count(), db.owner.count(), db.order.count(), db.orderItem.count(), db.stockReservation.count(), db.paymentEvent.count(), db.case.count(), db.caseItem.count(), db.aiDraft.count(), db.protectionSetting.count(), db.demoRun.count(),
  ]);
  return {
    seededProducts: products.length,
    counts: { products: productCount, owners: ownerCount, orders: orderCount, orderItems: orderItemCount, stockReservations: reservationCount, paymentEvents: eventCount, cases: caseCount, caseItems: caseItemCount, aiDrafts: draftCount, protectionSettings: settingsCount, demoRuns: runCount },
  };
}

async function releaseExpiredReservations(force = false) {
  const db = getDatabase();
  if (!db) return;
  const now = Date.now();
  if (!force && runtime.payproofExpirySweep && now - runtime.payproofExpirySweep.at < 30_000) {
    await runtime.payproofExpirySweep.promise;
    return;
  }
  const sweep = (async () => {
  const expiredRows = await db.stockReservation.findMany({
    where: { status: "HELD", expiresAt: { lt: new Date() }, order: { status: "PENDING" } },
    select: { orderId: true, productId: true, quantity: true },
  });
  const grouped = new Map<string, typeof expiredRows>();
  for (const row of expiredRows) grouped.set(row.orderId, [...(grouped.get(row.orderId) ?? []), row]);
  for (const [orderId, reservations] of grouped) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "FAILED" } });
      if (!claimed.count) return;
      for (const reservation of reservations) await tx.product.update({ where: { id: reservation.productId }, data: { availableStock: { increment: reservation.quantity } } });
      await tx.stockReservation.updateMany({ where: { orderId, status: "HELD" }, data: { status: "RELEASED" } });
      await tx.paymentEvent.create({ data: { orderId, type: "RESERVATION_EXPIRED", paymentStatus: "EXPIRED", issue: "RESERVATION_EXPIRED", rawJson: { simulated: true, releasedUnits: reservations.reduce((sum, row) => sum + row.quantity, 0) } } });
      const caseId = `CASE-${randomUUID().slice(0, 8).toUpperCase()}`;
      await tx.case.create({
        data: {
          id: caseId, orderId, type: "PAYMENT_TIMEOUT", cause: "Payment remained pending until its stock reservation expired.", uncertainty: "No capture result was recorded; this does not establish customer intent.", status: "OPEN", simulated: true,
          items: { create: [
            { kind: "order", referenceId: orderId, completeness: "PRESENT", payload: { orderId } },
            { kind: "stock_reservation", referenceId: orderId, completeness: "RELEASED", payload: { units: reservations.reduce((sum, row) => sum + row.quantity, 0) } },
            { kind: "payment_event", referenceId: orderId, completeness: "MISSING", payload: { note: "No capture result was recorded before expiry." } },
            { kind: "fulfillment", completeness: "MISSING", payload: { note: "No fulfillment record is connected in this demo." } },
          ] },
        },
      });
    });
  }
  })();
  runtime.payproofExpirySweep = { at: now, promise: sweep };
  try { await sweep; }
  catch (error) { if (runtime.payproofExpirySweep?.promise === sweep) runtime.payproofExpirySweep = undefined; throw error; }
}

export async function getDatabaseDemoState() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await ensureSeeded();
  await releaseExpiredReservations();
  const [productRows, settings, recentOrders, recentCases, reservationTotals, paymentCount, failedCount, openCaseCount, stuckTotals, releasedTotals, recoveredTotals] = await Promise.all([
    db.product.findMany(),
    db.protectionSetting.findUnique({ where: { id: 1 } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { items: true } }),
    db.case.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.stockReservation.groupBy({ by: ["productId", "status"], _sum: { quantity: true } }),
    db.paymentEvent.count(),
    db.paymentEvent.count({ where: { type: "CAPTURE_RESULT", paymentStatus: "FAILED" } }),
    db.case.count({ where: { status: "OPEN" } }),
    db.stockReservation.aggregate({ where: { status: "HELD", order: { status: "FAILED" } }, _sum: { quantity: true } }),
    db.stockReservation.aggregate({ where: { status: "RELEASED" }, _sum: { quantity: true } }),
    db.order.aggregate({ where: { recoveredFromOrderId: { not: null }, status: "PAID" }, _sum: { totalCents: true }, _count: { _all: true } }),
  ]);
  const stock = Object.fromEntries(productRows.map((product) => [product.id, product.availableStock]));
  const heldStock = Object.fromEntries(productRows.map((product) => [product.id, reservationTotals.find((item) => item.productId === product.id && item.status === "HELD")?._sum.quantity ?? 0]));
  const committedStock = Object.fromEntries(productRows.map((product) => [product.id, reservationTotals.find((item) => item.productId === product.id && item.status === "COMMITTED")?._sum.quantity ?? 0]));
  const releasedStock = releasedTotals._sum.quantity ?? 0;
  const stuckStock = stuckTotals._sum.quantity ?? 0;
  const relevantOrderIds = [...new Set([...recentOrders.map((order) => order.id), ...recentCases.map((item) => item.orderId)])];
  const events = relevantOrderIds.length ? await db.paymentEvent.findMany({
    where: { orderId: { in: relevantOrderIds }, type: "CAPTURE_RESULT" },
    orderBy: { createdAt: "desc" },
    take: relevantOrderIds.length * 2,
    select: { orderId: true, issue: true, debugId: true },
  }) : [];
  const latestEvents = new Map<string, (typeof events)[number]>();
  for (const event of events) if (!latestEvents.has(event.orderId)) latestEvents.set(event.orderId, event);

  return {
    simulated: true as const,
    storage: "neon-postgres",
    protected: settings?.enabled ?? true,
    stock,
    heldStock,
    committedStock,
    orders: recentOrders.map((order) => {
      const event = latestEvents.get(order.id);
      return { id: order.id, amount: order.totalCents / 100, status: order.status, createdAt: order.createdAt.toISOString(), items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })), issue: event?.issue ?? undefined, debug_id: event?.debugId ?? undefined, recoveredFromOrderId: order.recoveredFromOrderId ?? undefined };
    }),
    cases: recentCases.map((item) => {
      const event = latestEvents.get(item.orderId);
      return { id: item.id, orderId: item.orderId, issue: event?.issue ?? item.cause, debug_id: event?.debugId ?? undefined, createdAt: item.createdAt.toISOString(), status: item.status };
    }),
    counters: { paymentEvents: paymentCount, failedPayments: failedCount, recoveredStock: releasedStock, stuckStock, openCases: openCaseCount, recoveredRevenue: (recoveredTotals._sum.totalCents ?? 0) / 100, recoveredOrders: recoveredTotals._count._all },
  };
}

export async function createDatabaseOrder(items: CartLine[], idempotencyKey: string, customerAccessTokenHash: string, recoveredFromOrderId?: string) {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await ensureSeeded();
  await releaseExpiredReservations(true);
  const fingerprint = cartFingerprint(items);
  const existing = await db.order.findUnique({ where: { idempotencyKey } });
  if (existing) {
    await db.order.update({ where: { id: existing.id }, data: { customerAccessTokenHash } });
    return readExistingOrder(db, existing.id, fingerprint);
  }
  const catalogRows = await db.product.findMany({ where: { id: { in: items.map((item) => item.id) } } });
  if (catalogRows.length !== items.length) throw new Error("The cart contains an unknown product.");
  const providerOrder = await paymentProvider.createOrder({ items, idempotencyKey });
  const totalCents = items.reduce((total, item) => total + (catalogRows.find((product) => product.id === item.id)?.priceCents ?? 0) * item.quantity, 0);
  const isSimulated = !paymentProvider.isRealProvider();
  try {
    const result = await db.$transaction(async (tx) => {
      const sameKey = await tx.order.findUnique({ where: { idempotencyKey } });
      if (sameKey) {
        await tx.order.update({ where: { id: sameKey.id }, data: { customerAccessTokenHash } });
        return { existingOrderId: sameKey.id } as const;
      }
      for (const item of items) {
        const updated = await tx.product.updateMany({ where: { id: item.id, availableStock: { gte: item.quantity } }, data: { availableStock: { decrement: item.quantity } } });
        if (!updated.count) throw new Error(`Not enough ${catalogRows.find((product) => product.id === item.id)?.name ?? "stock"} available.`);
      }
      await tx.order.create({
        data: {
          id: providerOrder.id, idempotencyKey, cartFingerprint: fingerprint, totalCents, status: "PENDING", simulated: isSimulated, customerAccessTokenHash, recoveredFromOrderId,
          items: { create: items.map((item) => ({ productId: item.id, quantity: item.quantity, unitPriceCents: catalogRows.find((product) => product.id === item.id)!.priceCents })) },
          reservations: { create: items.map((item) => ({ productId: item.id, quantity: item.quantity, status: "HELD", expiresAt: new Date(Date.now() + 15 * 60 * 1000) })) },
          paymentEvents: { create: { type: "ORDER_CREATED", paymentStatus: "PENDING", rawJson: { simulated: isSimulated, provider: paymentProvider.isRealProvider() ? "PayPal_Sandbox" : "MockProvider" } } },
        },
      });
      return { created: { id: providerOrder.id, amount: totalCents / 100, items, simulated: isSimulated } } as const;
    });
    if ("existingOrderId" in result && result.existingOrderId) return readExistingOrder(db, result.existingOrderId, fingerprint);
    return result.created;
  } catch (error) {
    if (isUniqueConflict(error)) {
      const winner = await db.order.findUnique({ where: { idempotencyKey } });
      if (winner) return readExistingOrder(db, winner.id, fingerprint);
    }
    throw error;
  }
}

async function readExistingOrder(db: NonNullable<ReturnType<typeof getDatabase>>, orderId: string, fingerprint: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Idempotent order could not be loaded.");
  if (order.cartFingerprint !== fingerprint) throw new Error("This checkout key was already used for a different cart.");
  return { id: order.id, amount: order.totalCents / 100, items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })), simulated: true as const, repeated: true };
}

export async function captureDatabaseOrder(orderId: string, outcome: "success" | "decline" | "duplicate", issueType?: string, issueDetails?: string) {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await releaseExpiredReservations(true);
  const claimed = await db.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "PROCESSING" } });
  if (!claimed.count) {
    const existing = await db.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new Error("Order not found in the simulated ledger.");
    const previous = await db.paymentEvent.findFirst({ where: { orderId, type: "CAPTURE_RESULT" }, orderBy: { createdAt: "desc" } });
    if (previous) return { payment: { status: previous.paymentStatus as "COMPLETED" | "FAILED", issue: previous.issue ?? undefined, debug_id: previous.debugId ?? undefined, raw: previous.rawJson }, state: await getDatabaseDemoState() };
    const expired = await db.paymentEvent.findFirst({ where: { orderId, type: "RESERVATION_EXPIRED" }, orderBy: { createdAt: "desc" } });
    if (expired) return { payment: { status: "FAILED" as const, issue: expired.issue ?? "RESERVATION_EXPIRED", raw: expired.rawJson }, state: await getDatabaseDemoState() };
    throw new Error("This simulated order is already being processed.");
  }

  let payment;
  try { payment = await paymentProvider.captureOrder(orderId, outcome); }
  catch (error) { await db.order.update({ where: { id: orderId }, data: { status: "PENDING" } }); throw error; }
  const nextStatus = payment.status === "COMPLETED" ? "PAID" : "FAILED";
  try {
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: nextStatus } });
      const eventFacts = { ...(payment.raw as Record<string, unknown>), ...(outcome !== "success" ? { customerReportedIssue: { type: issueType ?? "OTHER", originalText: issueDetails ?? "" } } : {}) };
      await tx.paymentEvent.create({ data: { orderId, type: "CAPTURE_RESULT", paymentStatus: payment.status, issue: payment.issue, debugId: payment.debug_id, rawJson: eventFacts as Prisma.InputJsonValue, simulated: true } });
      if (payment.status === "COMPLETED") {
        await tx.stockReservation.updateMany({ where: { orderId, status: "HELD" }, data: { status: "COMMITTED" } });
        return;
      }
      const settings = await tx.protectionSetting.findUnique({ where: { id: 1 } });
      const held = await tx.stockReservation.findMany({ where: { orderId, status: "HELD" } });
      await tx.case.create({
        data: {
          id: `CASE-${randomUUID().slice(0, 8).toUpperCase()}`, orderId, type: "PAYMENT_FAILURE", cause: payment.issue ?? "Payment failed", uncertainty: "Simulated provider result; this does not establish customer intent.", status: "OPEN", simulated: true,
          items: { create: [
            { kind: "order", referenceId: orderId, completeness: "PRESENT", payload: { orderId } },
            { kind: "payment_event", referenceId: orderId, completeness: "PRESENT", payload: { issue: payment.issue ?? null, debug_id: payment.debug_id ?? null } },
            ...(outcome !== "success" ? [{ kind: "checkout_issue_report", referenceId: orderId, completeness: "PRESENT", payload: { issueType: issueType ?? "OTHER", originalText: issueDetails ?? "" } }] : []),
            { kind: "stock_reservation", referenceId: orderId, completeness: settings?.enabled ? "RELEASED" : "HELD", payload: { units: held.reduce((sum, item) => sum + item.quantity, 0) } },
            { kind: "fulfillment", completeness: "MISSING", payload: { note: "No fulfillment record is connected in this demo." } },
          ] },
        },
      });
      if (settings?.enabled) {
        for (const reservation of held) await tx.product.update({ where: { id: reservation.productId }, data: { availableStock: { increment: reservation.quantity } } });
        await tx.stockReservation.updateMany({ where: { orderId, status: "HELD" }, data: { status: "RELEASED" } });
      }
    });
  } catch (error) {
    const current = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (current?.status === "PROCESSING") await db.order.update({ where: { id: orderId }, data: { status: "PENDING" } });
    throw error;
  }
  return { payment, state: await getDatabaseDemoState() };
}

export async function setDatabaseProtection(enabled: boolean) {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await db.protectionSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled }, update: { enabled, updatedAt: new Date() } });
  return getDatabaseDemoState();
}

export async function resetDatabaseDemo() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await db.$transaction(async (tx) => {
    await tx.demoRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } });
    await tx.order.deleteMany();
    await tx.product.updateMany({ data: { availableStock: initialStock } });
    await tx.protectionSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true }, update: { enabled: true, updatedAt: new Date() } });
    await tx.demoRun.create({ data: { simulated: true } });
  });
  return getDatabaseDemoState();
}
