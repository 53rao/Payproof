CREATE TABLE "live_transaction_scans" (
    "event_id" UUID NOT NULL,
    "scan_json" JSONB NOT NULL,
    "scanned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "live_transaction_scans_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "live_transaction_scans_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "payment_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "incident_states" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "first_detected_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "action" TEXT,
    "acted_at" TIMESTAMPTZ(6),
    "acted_by" TEXT,
    CONSTRAINT "incident_states_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incident_states_active_last_seen_at_idx" ON "incident_states"("active", "last_seen_at");
