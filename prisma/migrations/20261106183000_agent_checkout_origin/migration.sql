CREATE TYPE "checkout_origin" AS ENUM ('AGENT', 'HUMAN', 'UNKNOWN');

ALTER TABLE "orders"
ADD COLUMN "checkout_origin" "checkout_origin" NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "cases"
ADD COLUMN "agent_handled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "human_review_required" BOOLEAN NOT NULL DEFAULT false;
