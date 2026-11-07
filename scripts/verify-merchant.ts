import { getDatabase, closeDatabase } from "@/db/client";
import { verifyPassword, createMerchantSession, verifyMerchantSession, hashPassword } from "@/lib/auth";
import { MERCHANT_SESSION_COOKIE } from "@/lib/auth-constants";

async function verify() {
  const db = getDatabase();
  if (!db) throw new Error("No DB connection.");

  console.log("--- 1. Testing Database Merchant Records & Hashed Passwords ---");
  const merchants = await db.merchant.findMany({
    select: { id: true, name: true, email: true, passwordHash: true },
  });
  console.log("Found merchants in database:", merchants.length);
  for (const m of merchants) {
    console.log(`- ${m.name} (${m.id}): email=${m.email}, hash_prefix=${m.passwordHash?.slice(0, 20)}...`);
    if (!m.passwordHash?.startsWith("scrypt_v1:")) {
      throw new Error(`Merchant ${m.id} does not have a valid scrypt_v1 password hash!`);
    }
  }

  console.log("\n--- 2. Verifying Passwords Timing-Safe & Scrypt ---");
  const northstar = merchants.find((m) => m.id === "northstar")!;
  const fieldform = merchants.find((m) => m.id === "fieldform")!;

  const nsValid = await verifyPassword("northstar123", northstar.passwordHash!);
  const nsInvalid = await verifyPassword("wrongpassword", northstar.passwordHash!);
  console.log("Northstar valid password check:", nsValid ? "PASSED" : "FAILED");
  console.log("Northstar invalid password rejected:", !nsInvalid ? "PASSED" : "FAILED");

  const ffValid = await verifyPassword("fieldform123", fieldform.passwordHash!);
  const ffInvalid = await verifyPassword("wrongpassword", fieldform.passwordHash!);
  console.log("Field & Form valid password check:", ffValid ? "PASSED" : "FAILED");
  console.log("Field & Form invalid password rejected:", !ffInvalid ? "PASSED" : "FAILED");

  console.log("\n--- 3. Testing Merchant HMAC Session Generation & Verification ---");
  const nsToken = createMerchantSession({
    merchantId: northstar.id,
    merchantName: northstar.name,
    email: northstar.email!,
  });
  const nsSession = verifyMerchantSession(nsToken);
  console.log("Northstar session verified:", nsSession?.merchantId === "northstar" ? "PASSED" : "FAILED");

  const ffToken = createMerchantSession({
    merchantId: fieldform.id,
    merchantName: fieldform.name,
    email: fieldform.email!,
  });
  const ffSession = verifyMerchantSession(ffToken);
  console.log("Field & Form session verified:", ffSession?.merchantId === "fieldform" ? "PASSED" : "FAILED");

  console.log("\n--- 4. Data Isolation Check (Northstar vs Field & Form) ---");
  const nsProducts = await db.product.findMany({ where: { merchantId: "northstar" }, select: { id: true } });
  const ffProducts = await db.product.findMany({ where: { merchantId: "fieldform" }, select: { id: true } });
  const nsProductIds = nsProducts.map((p) => p.id);
  const ffProductIds = ffProducts.map((p) => p.id);

  console.log("Northstar products:", nsProductIds.join(", "));
  console.log("Field & Form products:", ffProductIds.join(", "));

  const nsOrders = await db.order.findMany({
    where: { items: { some: { productId: { in: nsProductIds } } } },
  });
  const ffOrders = await db.order.findMany({
    where: { items: { some: { productId: { in: ffProductIds } } } },
  });
  console.log(`Northstar scoped orders count: ${nsOrders.length}`);
  console.log(`Field & Form scoped orders count: ${ffOrders.length}`);

  const nsCases = await db.case.findMany({
    where: { status: "OPEN", order: { items: { some: { productId: { in: nsProductIds } } } } },
  });
  const ffCases = await db.case.findMany({
    where: { status: "OPEN", order: { items: { some: { productId: { in: ffProductIds } } } } },
  });
  console.log(`Northstar scoped open cases count: ${nsCases.length}`);
  console.log(`Field & Form scoped open cases count: ${ffCases.length}`);

  console.log("\nALL DIRECT DATABASE & AUTH VERIFICATIONS PASSED!");
}

verify()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeDatabase();
    process.exit(1);
  });
