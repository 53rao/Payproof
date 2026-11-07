-- PayProof focuses on payment intelligence and case recovery; inventory is out of scope.
DELETE FROM "agent_action_logs" WHERE "type" = 'RESERVATION_RELEASED';
DELETE FROM "payment_events" WHERE "type" IN ('RESERVATION_EXPIRED', 'RESERVATION_RELEASED_AFTER_FAILURE');
DELETE FROM "cases" AS c
WHERE c."type" = 'PAYMENT_TIMEOUT'
  AND EXISTS (
    SELECT 1 FROM "case_items" AS ci
    WHERE ci."case_id" = c."id" AND ci."kind" = 'stock_reservation'
  );
DELETE FROM "case_items" WHERE "kind" = 'stock_reservation';
DROP TABLE IF EXISTS "stock_reservations";
DROP TYPE IF EXISTS "reservation_status";
ALTER TABLE "products" DROP COLUMN IF EXISTS "initial_stock";
ALTER TABLE "products" DROP COLUMN IF EXISTS "available_stock";
DROP TABLE IF EXISTS "protection_settings";
