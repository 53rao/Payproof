import { getDatabase, closeDatabase } from "@/db/client";
import { hashPassword } from "@/lib/auth";
import { DEMO_MERCHANTS, PRODUCT_TO_MERCHANT_ID } from "@/lib/merchants";
import { products } from "@/lib/products";
import { INITIAL_DEMO_STOCK } from "@/lib/inventory";

export async function seedMerchantAuth() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to seed merchant credentials.");

  console.log(`Seeding ${DEMO_MERCHANTS.length} merchants with scrypt_v1 hashes...`);

  for (const merchant of DEMO_MERCHANTS) {
    const passwordHash = await hashPassword(merchant.defaultPassword);
    await db.merchant.upsert({
      where: { id: merchant.id },
      create: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        passwordHash,
        simulated: true,
      },
      update: {
        name: merchant.name,
        email: merchant.email,
        passwordHash,
      },
    });
    console.log(`✓ Seeded merchant: ${merchant.name} (${merchant.id}) -> ${merchant.email}`);
  }

  console.log("Upserting catalog products with correct merchant attribution...");
  for (const product of products) {
    const merchantId = PRODUCT_TO_MERCHANT_ID[product.id] ?? "northstar";
    await db.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        name: product.name,
        priceCents: product.price * 100,
        initialStock: INITIAL_DEMO_STOCK,
        availableStock: INITIAL_DEMO_STOCK,
        simulated: true,
        merchantId,
      },
      update: {
        name: product.name,
        priceCents: product.price * 100,
        merchantId,
      },
    });
    console.log(`✓ Seeded product: ${product.name} -> merchant ${merchantId}`);
  }

  // Ensure seed orders and cases exist for all merchants so every merchant portal has data
  const sampleFixtures = [
    {
      merchantId: "apex",
      productId: "bottle",
      orderId: "DEMO-APEX-001",
      quantity: 1,
      totalCents: 4200,
      status: "FAILED" as const,
      caseId: "CASE-APEX01",
      caseIssue: "CARD_EXPIRED",
      origin: "HUMAN" as const,
    },
    {
      merchantId: "beacon",
      productId: "backpack",
      orderId: "DEMO-BEACON-001",
      quantity: 1,
      totalCents: 8800,
      status: "FAILED" as const,
      caseId: "CASE-BEACON01",
      caseIssue: "INSUFFICIENT_FUNDS",
      origin: "AGENT" as const,
    },
    {
      merchantId: "solis",
      productId: "blanket",
      orderId: "DEMO-SOLIS-001",
      quantity: 1,
      totalCents: 6400,
      status: "PAID" as const,
      caseId: "CASE-SOLIS01",
      caseIssue: "CUSTOMER_INQUIRY",
      origin: "HUMAN" as const,
    },
  ];

  for (const fix of sampleFixtures) {
    const existingOrder = await db.order.findUnique({ where: { id: fix.orderId } });
    if (!existingOrder) {
      await db.order.create({
        data: {
          id: fix.orderId,
          idempotencyKey: `seed:fixture:${fix.orderId}`,
          cartFingerprint: JSON.stringify([{ id: fix.productId, quantity: fix.quantity }]),
          totalCents: fix.totalCents,
          status: fix.status,
          checkoutOrigin: fix.origin,
          simulated: true,
          items: {
            create: {
              productId: fix.productId,
              quantity: fix.quantity,
              unitPriceCents: fix.totalCents,
            },
          },
          cases: {
            create: {
              id: fix.caseId,
              cause: fix.caseIssue,
              uncertainty:
                fix.status === "FAILED"
                  ? "Seeded demo fixture; this does not establish customer intent."
                  : "Seeded demo fixture; details may be incomplete.",
              type: fix.status === "FAILED" ? "PAYMENT_FAILURE" : "CUSTOMER_COMPLAINT",
              status: "OPEN",
              simulated: true,
              humanReviewRequired: fix.origin === "HUMAN",
              agentHandled: fix.origin === "AGENT",
            },
          },
          paymentEvents: {
            create: {
              type: "CAPTURE_RESULT",
              paymentStatus: fix.status,
              issue: fix.status === "FAILED" ? fix.caseIssue : null,
              rawJson: {
                provider: "BRAINTREE_SANDBOX",
                amountCents: fix.totalCents,
                currency: "USD",
                seeded: true,
              },
              simulated: true,
            },
          },
        },
      });
      console.log(`✓ Seeded demo activity fixture for merchant ${fix.merchantId} (Order ${fix.orderId})`);
    }
  }

  console.log(`\nAll ${DEMO_MERCHANTS.length} merchants successfully configured with credentials and products.`);
}

if (require.main === module) {
  seedMerchantAuth()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Failed to seed merchant credentials:", err);
      await closeDatabase();
      process.exit(1);
    });
}
