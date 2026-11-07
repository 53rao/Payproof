-- CreateTable
CREATE TABLE "simulation_diagnoses" (
    "id" TEXT NOT NULL,
    "simulation_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "pattern_detected" TEXT NOT NULL,
    "likely_cause" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "confidence_reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulation_diagnoses_simulation_id_key" ON "simulation_diagnoses"("simulation_id");

-- CreateIndex
CREATE INDEX "simulation_diagnoses_created_at_idx" ON "simulation_diagnoses"("created_at");
