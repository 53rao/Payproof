CREATE TABLE "agent_action_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_action_logs_created_at_idx" ON "agent_action_logs"("created_at");

ALTER TABLE "agent_action_logs"
ADD CONSTRAINT "agent_action_logs_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
