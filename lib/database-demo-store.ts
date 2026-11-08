import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { products } from "@/lib/products";
import { DEMO_MERCHANTS, PRODUCT_TO_MERCHANT_ID } from "@/lib/merchants";
import { paymentProvider } from "@/lib/payment-provider";
import { getDatabase } from "@/db/client";
import { logAgentAction } from "@/lib/agent-action-log";
import { hashPassword } from "@/lib/auth";

type CartLine = { id: string; quantity: number };
const cartFingerprint = (items: CartLine[]) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
const isUniqueConflict = (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "P2002";
const runtime = globalThis as typeof globalThis & {
  payproofSeedCheck?: { connection: string; promise: Promise<void> };
};

async function ensureSeeded() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to seed the database.");
  const connection = process.env.DATABASE_URL ?? "";
  if (runtime.payproofSeedCheck?.connection === connection) return runtime.payproofSeedCheck.promise;
  const promise = (async () => {
    const marker = await db.order.findUnique({ where: { id: "DEMO-ORDER-PAID" }, select: { id: true } });
    if (!marker) await seedDatabase();

    const apex = await db.merchant.findUnique({ where: { id: "apex" }, select: { email: true, passwordHash: true } });
    if (!apex?.passwordHash) {
      for (const merchant of DEMO_MERCHANTS) {
        const passwordHash = await hashPassword(merchant.defaultPassword);
        await db.merchant.upsert({
          where: { id: merchant.id },
          create: { id: merchant.id, name: merchant.name, email: merchant.email, passwordHash, simulated: true },
          update: { name: merchant.name, email: merchant.email, passwordHash },
        });
      }
    }
  })();
  runtime.payproofSeedCheck = { connection, promise };
  try { await promise; }
  catch (error) { if (runtime.payproofSeedCheck?.promise === promise) runtime.payproofSeedCheck = undefined; throw error; }
}

export async function seedDatabase() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to seed the database.");

  for (const merchant of DEMO_MERCHANTS) {
    const passwordHash = await hashPassword(merchant.defaultPassword);
    await db.merchant.upsert({
      where: { id: merchant.id },
      create: { id: merchant.id, name: merchant.name, email: merchant.email, passwordHash, simulated: true },
      update: { name: merchant.name, email: merchant.email, passwordHash },
    });
  }

  for (const product of products) {
    const merchantId = PRODUCT_TO_MERCHANT_ID[product.id] ?? "northstar";
    await db.product.upsert({
      where: { id: product.id },
      create: { id: product.id, name: product.name, priceCents: product.price * 100, simulated: true, merchantId },
      update: { name: product.name, priceCents: product.price * 100, merchantId },
    });
  }
  // Seed-only marker. This is not a usable password hash or a demo login.
  await db.owner.upsert({
    where: { email: "demo-owner@example.test" },
    create: { id: "00000000-0000-4000-8000-000000000001", email: "demo-owner@example.test", passwordHash: "seed-only-unusable-password-hash" },
    update: {},
  });

  const fixtures = [
    { id: "DEMO-ORDER-PAID", key: "seed:v1:paid", productId: "mug", quantity: 1, status: "PAID" as const, totalCents: 2800, createdAt: new Date("2026-10-26T09:15:00.000Z") },
    { id: "DEMO-ORDER-FAILED", key: "seed:v1:failed", productId: "candle", quantity: 1, status: "FAILED" as const, totalCents: 3200, createdAt: new Date("2026-10-26T10:42:00.000Z") },
    { id: "DEMO-ORDER-PENDING", key: "seed:v1:pending", productId: "tote", quantity: 1, status: "PENDING" as const, totalCents: 3600, createdAt: new Date("2026-10-27T08:30:00.000Z") },
  ];

  for (const order of fixtures) {
    await db.order.createMany({
      data: [{ id: order.id, idempotencyKey: order.key, cartFingerprint: cartFingerprint([{ id: order.productId, quantity: order.quantity }]), totalCents: order.totalCents, status: order.status, simulated: true, createdAt: order.createdAt }],
      skipDuplicates: true,
    });
    await db.orderItem.createMany({ data: [{ orderId: order.id, productId: order.productId, quantity: order.quantity, unitPriceCents: order.totalCents }], skipDuplicates: true });
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
    data: [{ id: "30000000-0000-4000-8000-000000000001", caseId: failureCaseId, kind: "customer_status_update", body: "We could not complete the payment for your order. Please check your payment method or try again.", simulated: true }],
    skipDuplicates: true,
  });
  await db.demoRun.createMany({
    data: [{ id: "40000000-0000-4000-8000-000000000001", startedAt: new Date("2026-10-26T09:00:00.000Z"), endedAt: new Date("2026-10-26T11:00:00.000Z"), simulated: true }],
    skipDuplicates: true,
  });
  const activeRun = await db.demoRun.findFirst({ where: { endedAt: null }, select: { id: true } });
  if (!activeRun) await db.demoRun.create({ data: { simulated: true } });

  const [productCount, ownerCount, orderCount, orderItemCount, eventCount, caseCount, caseItemCount, draftCount, runCount] = await Promise.all([
    db.product.count(), db.owner.count(), db.order.count(), db.orderItem.count(), db.paymentEvent.count(), db.case.count(), db.caseItem.count(), db.aiDraft.count(), db.demoRun.count(),
  ]);
  return { seededProducts: products.length, counts: { products: productCount, owners: ownerCount, orders: orderCount, orderItems: orderItemCount, paymentEvents: eventCount, cases: caseCount, caseItems: caseItemCount, aiDrafts: draftCount, demoRuns: runCount } };
}

export async function getDatabaseDemoState() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await ensureSeeded();
  const [recentOrders, recentCases, paymentCount, failedCount, openCaseCount, agentFailureCases, humanFailureCases, recoveredTotals] = await Promise.all([
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { items: true } }),
    db.case.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.paymentEvent.count(),
    db.paymentEvent.count({ where: { type: "CAPTURE_RESULT", paymentStatus: "FAILED" } }),
    db.case.count({ where: { status: "OPEN" } }),
    db.case.count({ where: { status: "OPEN", type: "PAYMENT_FAILURE", agentHandled: true } }),
    db.case.count({ where: { status: "OPEN", type: "PAYMENT_FAILURE", order: { is: { checkoutOrigin: "HUMAN" } } } }),
    db.order.aggregate({ where: { recoveredFromOrderId: { not: null }, status: "PAID" }, _sum: { totalCents: true }, _count: { _all: true } }),
  ]);
  const relevantOrderIds = [...new Set([...recentOrders.map((order) => order.id), ...recentCases.map((item) => item.orderId)])];
  const events = relevantOrderIds.length ? await db.paymentEvent.findMany({
    where: { orderId: { in: relevantOrderIds }, type: "CAPTURE_RESULT" },
    orderBy: { createdAt: "desc" },
    take: relevantOrderIds.length * 2,
    select: { orderId: true, issue: true, debugId: true, rawJson: true },
  }) : [];
  const latestEvents = new Map<string, (typeof events)[number]>();
  for (const event of events) if (!latestEvents.has(event.orderId)) latestEvents.set(event.orderId, event);

  return {
    simulated: true as const,
    storage: "neon-postgres",
    orders: recentOrders.map((order) => {
      const event = latestEvents.get(order.id);
      const raw = event?.rawJson;
      const transactionId = raw && typeof raw === "object" && !Array.isArray(raw) && "transactionId" in raw && typeof raw.transactionId === "string" ? raw.transactionId : undefined;
      return { id: order.id, amount: order.totalCents / 100, status: order.status, createdAt: order.createdAt.toISOString(), items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })), issue: event?.issue ?? undefined, debug_id: event?.debugId ?? undefined, transactionId, recoveredFromOrderId: order.recoveredFromOrderId ?? undefined, simulated: order.simulated, origin: order.checkoutOrigin };
    }),
    cases: recentCases.map((item) => {
      const event = latestEvents.get(item.orderId);
      return { id: item.id, orderId: item.orderId, issue: event?.issue ?? item.cause, debug_id: event?.debugId ?? undefined, createdAt: item.createdAt.toISOString(), status: item.status, agentHandled: item.agentHandled, humanReviewRequired: item.humanReviewRequired };
    }),
    counters: { paymentEvents: paymentCount, failedPayments: failedCount, openCases: openCaseCount, agentFailureCases, humanFailureCases, recoveredRevenue: (recoveredTotals._sum.totalCents ?? 0) / 100, recoveredOrders: recoveredTotals._count._all },
  };
}

export async function createDatabaseOrder(items: CartLine[], idempotencyKey: string, customerAccessTokenHash: string, recoveredFromOrderId?: string, origin: "AGENT" | "HUMAN" | "UNKNOWN" = "UNKNOWN") {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await ensureSeeded();
  const fingerprint = cartFingerprint(items);
  const existing = await db.order.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.checkoutOrigin !== origin) throw new Error("This checkout key was already used for a different checkout origin.");
    await db.order.update({ where: { id: existing.id }, data: { customerAccessTokenHash } });
    return readExistingOrder(db, existing.id, fingerprint, origin);
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
      await tx.order.create({
        data: {
          id: providerOrder.id, idempotencyKey, cartFingerprint: fingerprint, totalCents, status: "PENDING", simulated: isSimulated, customerAccessTokenHash, recoveredFromOrderId, checkoutOrigin: origin,
          items: { create: items.map((item) => ({ productId: item.id, quantity: item.quantity, unitPriceCents: catalogRows.find((product) => product.id === item.id)!.priceCents })) },
          paymentEvents: { create: { type: "ORDER_CREATED", paymentStatus: "PENDING", rawJson: { simulated: isSimulated, provider: paymentProvider.isRealProvider() ? "Braintree_Sandbox" : "MockProvider" } } },
        },
      });
      return { created: { id: providerOrder.id, amount: totalCents / 100, items, simulated: isSimulated, origin } } as const;
    });
    if ("existingOrderId" in result && result.existingOrderId) return readExistingOrder(db, result.existingOrderId, fingerprint, origin);
    return result.created;
  } catch (error) {
    if (isUniqueConflict(error)) {
      const winner = await db.order.findUnique({ where: { idempotencyKey } });
      if (winner) return readExistingOrder(db, winner.id, fingerprint, origin);
    }
    throw error;
  }
}

async function readExistingOrder(db: NonNullable<ReturnType<typeof getDatabase>>, orderId: string, fingerprint: string, expectedOrigin?: "AGENT" | "HUMAN" | "UNKNOWN") {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Idempotent order could not be loaded.");
  if (order.cartFingerprint !== fingerprint) throw new Error("This checkout key was already used for a different cart.");
  if (expectedOrigin && order.checkoutOrigin !== expectedOrigin) throw new Error("This checkout key was already used for a different checkout origin.");
  return { id: order.id, amount: order.totalCents / 100, items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })), simulated: order.simulated, origin: order.checkoutOrigin, repeated: true };
}

export async function captureDatabaseOrder(orderId: string, outcome: "success" | "decline" | "duplicate", paymentMethodNonce?: string, issueType?: string, issueDetails?: string, diagnosticScenario?: { type: string; label: string; expectedSignal: string }) {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  const orderContext = await db.order.findUnique({
    where: { id: orderId },
    select: { checkoutOrigin: true, items: { select: { product: { select: { merchantId: true, merchant: { select: { name: true } } } } } } },
  });
  if (!orderContext) throw new Error("Order not found in the simulated ledger.");
  const orderOrigin = orderContext.checkoutOrigin;
  const agentHandled = orderOrigin === "AGENT";
  const claimed = await db.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "PROCESSING" } });
  if (!claimed.count) {
    const existing = await db.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new Error("Order not found in the simulated ledger.");
    const previous = await db.paymentEvent.findFirst({ where: { orderId, type: "CAPTURE_RESULT" }, orderBy: { createdAt: "desc" } });
    if (previous) return { payment: { status: previous.paymentStatus as "COMPLETED" | "FAILED", issue: previous.issue ?? undefined, debug_id: previous.debugId ?? undefined, raw: previous.rawJson }, state: await getDatabaseDemoState() };
    throw new Error("This simulated order is already being processed.");
  }

  let payment;
  try { payment = await paymentProvider.captureOrder(orderId, outcome, paymentMethodNonce); }
  catch (error) { await db.order.update({ where: { id: orderId }, data: { status: "PENDING" } }); throw error; }
  const nextStatus = payment.status === "COMPLETED" ? "PAID" : "FAILED";
  try {
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: nextStatus } });
      const eventFacts = { ...(payment.raw as Record<string, unknown>), ...(diagnosticScenario ? { diagnosticScenario } : {}), ...(outcome !== "success" ? { customerReportedIssue: { type: issueType ?? "OTHER", originalText: issueDetails ?? "" } } : {}) };
      const simulated = orderId.startsWith("SIM-") || orderId.startsWith("DEMO-") || ("simulated" in payment.raw && payment.raw.simulated === true);
      await tx.paymentEvent.create({ data: { orderId, type: "CAPTURE_RESULT", paymentStatus: payment.status, issue: payment.issue, debugId: payment.debug_id, rawJson: eventFacts as Prisma.InputJsonValue, simulated } });
      if (payment.status === "COMPLETED") return;
      const caseId = `CASE-${randomUUID().slice(0, 8).toUpperCase()}`;
      await tx.case.create({
        data: {
          id: caseId, orderId, type: "PAYMENT_FAILURE", cause: payment.issue ?? "Payment failed", uncertainty: simulated ? "Simulated provider result; this does not establish customer intent." : "A Braintree Sandbox payment failed; this does not establish customer intent.", status: "OPEN", simulated, agentHandled, humanReviewRequired: agentHandled,
          items: { create: [
            { kind: "order", referenceId: orderId, completeness: "PRESENT", payload: { orderId } },
            { kind: "payment_event", referenceId: orderId, completeness: "PRESENT", payload: { issue: payment.issue ?? null, debug_id: payment.debug_id ?? null } },
            ...(outcome !== "success" ? [{ kind: "checkout_issue_report", referenceId: orderId, completeness: "PRESENT", payload: { issueType: issueType ?? "OTHER", originalText: issueDetails ?? "" } }] : []),
          ] },
        },
      });
      if (agentHandled) {
        const merchantItems = new Map<string, (typeof orderContext.items)[number]>();
        for (const item of orderContext.items) merchantItems.set(item.product.merchantId, item);
        for (const item of merchantItems.values()) {
          await logAgentAction("CASE_ESCALATED", item.product.merchantId, `Escalated to human review — ${item.product.merchant.name} · Case ${caseId} opened automatically.`, tx);
          await logAgentAction("RECOVERY_SUPPRESSED", item.product.merchantId, `Win-back suppressed — ${item.product.merchant.name} · Agent-initiated failure does not receive a customer recovery link.`, tx);
        }
      }
    });
  } catch (error) {
    const current = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (current?.status === "PROCESSING") await db.order.update({ where: { id: orderId }, data: { status: "PENDING" } });
    throw error;
  }
  return { payment, state: await getDatabaseDemoState() };
}

export async function listDatabaseDashboardSimulations() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required for dashboard simulations.");
  const orders = await db.order.findMany({
    where: { idempotencyKey: { startsWith: "SIMDASH-" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { paymentEvents: { where: { type: "CAPTURE_RESULT" }, orderBy: { createdAt: "desc" }, take: 1 }, cases: { select: { id: true }, take: 1 } },
  });
  const ftMap: Record<string, string> = { PD: "processor_decline", IE: "instrument_expired", DI: "duplicate_invoice", NT: "network_timeout" };
  const merchMap: Record<string, string> = { NS: "northstar", FF: "fieldform" };
  return orders.map((order) => {
    const keyParts = order.idempotencyKey.split("-");
    const event = order.paymentEvents[0];
    const raw = event?.rawJson;
    const transactionId = raw && typeof raw === "object" && !Array.isArray(raw) && "transactionId" in raw && typeof raw.transactionId === "string" ? raw.transactionId : undefined;
    if (keyParts[1] === "V2F") {
      // SIMDASH-V2F-<simToken32>-<ftShort>-<merchantShort>-<originShort>-<seq>-<rand8>
      const simToken = keyParts[2] ?? "";
      const simulationId = simToken.length === 32 ? `${simToken.slice(0, 8)}-${simToken.slice(8, 12)}-${simToken.slice(12, 16)}-${simToken.slice(16, 20)}-${simToken.slice(20)}`.toLowerCase() : simToken || null;
      const failureType = ftMap[keyParts[3] ?? ""] ?? "unknown";
      const merchantId = merchMap[keyParts[4] ?? ""] ?? "unknown";
      return {
        id: order.id,
        simulationId,
        scenario: failureType,
        failureType,
        merchantId,
        origin: order.checkoutOrigin,
        outcome: event?.paymentStatus ?? order.status,
        transactionId,
        caseId: order.cases[0]?.id ?? null,
        caseCreated: order.cases.length > 0,
        createdAt: order.createdAt.toISOString(),
      };
    }
    if (keyParts[1] === "V2") {
      // Legacy short form: SIMDASH-V2-<sim8>-<ftShort>-<merchantShort>-<originShort>-<seq>-<rand8>
      const failureType = ftMap[keyParts[3] ?? ""] ?? "unknown";
      const merchantId = merchMap[keyParts[4] ?? ""] ?? "unknown";
      return {
        id: order.id,
        simulationId: keyParts[2] ?? null,
        scenario: failureType,
        failureType,
        merchantId,
        origin: order.checkoutOrigin,
        outcome: event?.paymentStatus ?? order.status,
        transactionId,
        caseId: order.cases[0]?.id ?? null,
        caseCreated: order.cases.length > 0,
        createdAt: order.createdAt.toISOString(),
      };
    }
    const scenario = `${keyParts[1]?.toLowerCase() ?? "unknown"}_${keyParts[2]?.toLowerCase() ?? "unknown"}`;
    return { id: order.id, simulationId: null, scenario, failureType: "legacy", merchantId: "unknown", origin: order.checkoutOrigin, outcome: event?.paymentStatus ?? order.status, transactionId, caseId: order.cases[0]?.id ?? null, caseCreated: order.cases.length > 0, createdAt: order.createdAt.toISOString() };
  });
}

export async function resetDatabaseDemo() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is not configured.");
  await db.$transaction(async (tx) => {
    await tx.demoRun.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } });
    await tx.order.deleteMany();
    await tx.demoRun.create({ data: { simulated: true } });
  });
  return getDatabaseDemoState();
}

export async function getDatabaseOrderActivity() {
  const db = getDatabase();
  if (!db) return [];
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      items: true,
      paymentEvents: { where: { type: "CAPTURE_RESULT" }, orderBy: { createdAt: "desc" }, take: 1 },
      cases: { select: { id: true, status: true, cause: true }, take: 1 },
    },
  });
  return orders.map((order) => {
    const event = order.paymentEvents[0];
    const raw = event?.rawJson;
    const transactionId = raw && typeof raw === "object" && !Array.isArray(raw) && "transactionId" in raw && typeof raw.transactionId === "string" ? raw.transactionId : undefined;
    const linkedCase = order.cases[0];
    return {
      id: order.id,
      amount: order.totalCents / 100,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      origin: order.checkoutOrigin,
      transactionId,
      issue: event?.issue ?? undefined,
      debug_id: event?.debugId ?? undefined,
      items: order.items.map((item) => ({ id: item.productId, quantity: item.quantity })),
      case: linkedCase ? { id: linkedCase.id, status: linkedCase.status, issue: linkedCase.cause } : undefined,
    };
  });
}
