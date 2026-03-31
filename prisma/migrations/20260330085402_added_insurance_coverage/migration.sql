/*
  Warnings:

  - The `status` column on the `InsuranceClaim` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `patientId` to the `InsuranceClaim` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ClaimItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "patientId" TEXT NOT NULL,
ADD COLUMN     "patientInsuranceId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "insuranceCoveredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "patientInsuranceId" TEXT,
ADD COLUMN     "patientResponsibility" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PatientInsurance" ADD COLUMN     "annualLimit" DOUBLE PRECISION,
ADD COLUMN     "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayReference" TEXT,
ADD COLUMN     "gatewayResponse" JSONB;

-- CreateTable
CREATE TABLE "ClaimItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceId" TEXT,
    "billedAmount" DOUBLE PRECISION NOT NULL,
    "coveredAmount" DOUBLE PRECISION NOT NULL,
    "patientPortion" DOUBLE PRECISION NOT NULL,
    "status" "ClaimItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffSchedule" (
    "id" TEXT NOT NULL,
    "hmoName" TEXT NOT NULL,
    "planName" TEXT,
    "serviceId" TEXT NOT NULL,
    "hmoPrice" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),

    CONSTRAINT "TariffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimItem_claimId_idx" ON "ClaimItem"("claimId");

-- CreateIndex
CREATE INDEX "TariffSchedule_hmoName_idx" ON "TariffSchedule"("hmoName");

-- CreateIndex
CREATE UNIQUE INDEX "TariffSchedule_hmoName_planName_serviceId_key" ON "TariffSchedule"("hmoName", "planName", "serviceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffSchedule" ADD CONSTRAINT "TariffSchedule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
