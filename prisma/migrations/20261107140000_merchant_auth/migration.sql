-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "email" TEXT,
ADD COLUMN "password_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_unique" ON "merchants"("email");
