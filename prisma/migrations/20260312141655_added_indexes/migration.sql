-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "lastRefillDate" TIMESTAMP(3),
ADD COLUMN     "nextRefillDate" TIMESTAMP(3),
ADD COLUMN     "refillsRemaining" INTEGER;

-- CreateTable
CREATE TABLE "RefillRequest" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "RefillStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "processedById" TEXT,

    CONSTRAINT "RefillRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefillRequest_prescriptionId_idx" ON "RefillRequest"("prescriptionId");

-- CreateIndex
CREATE INDEX "RefillRequest_patientId_idx" ON "RefillRequest"("patientId");

-- CreateIndex
CREATE INDEX "RefillRequest_status_idx" ON "RefillRequest"("status");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_status_idx" ON "Prescription"("status");

-- CreateIndex
CREATE INDEX "Prescription_nextRefillDate_idx" ON "Prescription"("nextRefillDate");

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
