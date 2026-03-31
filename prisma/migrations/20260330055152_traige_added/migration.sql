/*
  Warnings:

  - You are about to drop the column `invoiceId` on the `Appointment` table. All the data in the column will be lost.
  - The `paymentStatus` column on the `Appointment` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `userId` on the `Triage` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[labOrderId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[radiologyRequestId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[prescriptionId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[appointmentId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ServicePaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'CLEARED', 'WAIVED');

-- DropForeignKey
ALTER TABLE "Triage" DROP CONSTRAINT "Triage_userId_fkey";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "invoiceId",
ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "waiverReason" TEXT,
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "labOrderId" TEXT,
ADD COLUMN     "prescriptionId" TEXT,
ADD COLUMN     "radiologyRequestId" TEXT,
ADD COLUMN     "submittedAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LabOrder" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN     "waiverReason" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN     "waiverReason" TEXT;

-- AlterTable
ALTER TABLE "RadiologyRequest" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN     "waiverReason" TEXT;

-- AlterTable
ALTER TABLE "Triage" DROP COLUMN "userId";

-- DropEnum
DROP TYPE "AppointmentPaymentStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_labOrderId_key" ON "Invoice"("labOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_radiologyRequestId_key" ON "Invoice"("radiologyRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_prescriptionId_key" ON "Invoice"("prescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_radiologyRequestId_fkey" FOREIGN KEY ("radiologyRequestId") REFERENCES "RadiologyRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyRequest" ADD CONSTRAINT "RadiologyRequest_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
