CREATE TABLE "merchants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "simulated" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);
INSERT INTO "merchants" ("id", "name") VALUES ('northstar', 'Northstar Goods'), ('fieldform', 'Field & Form');
ALTER TABLE "products" ADD COLUMN "merchant_id" TEXT NOT NULL DEFAULT 'northstar';
UPDATE "products" SET "merchant_id" = 'fieldform' WHERE "id" IN ('journal', 'bottle', 'socks');
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "orders" ("id", "idempotency_key", "cart_fingerprint", "total_cents", "status", "simulated", "checkout_origin", "created_at")
VALUES ('DEMO-FIELD-FAILED', 'seed:v1:field-failed', '[{"id":"journal","quantity":1}]', 1800, 'FAILED', true, 'HUMAN', '2026-10-27T10:15:00Z')
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "order_items" ("order_id", "product_id", "quantity", "unit_price_cents")
VALUES ('DEMO-FIELD-FAILED', 'journal', 1, 1800)
ON CONFLICT ("order_id", "product_id") DO NOTHING;
INSERT INTO "payment_events" ("order_id", "type", "payment_status", "issue", "raw_json", "simulated", "created_at")
SELECT 'DEMO-FIELD-FAILED', 'CAPTURE_RESULT', 'FAILED', 'INSTRUMENT_DECLINED', '{"provider":"MockProvider","seeded":true}'::jsonb, true, '2026-10-27T10:15:05Z'
WHERE NOT EXISTS (SELECT 1 FROM "payment_events" WHERE "order_id" = 'DEMO-FIELD-FAILED');
INSERT INTO "cases" ("id", "order_id", "type", "status", "cause", "uncertainty", "simulated", "created_at")
VALUES ('CASE-DEMO-FIELD-DECLINE', 'DEMO-FIELD-FAILED', 'PAYMENT_FAILURE', 'OPEN', 'The simulated provider returned INSTRUMENT_DECLINED for this Field & Form order.', 'This fictional provider result does not establish customer intent.', true, '2026-10-27T10:15:06Z')
ON CONFLICT ("id") DO NOTHING;
