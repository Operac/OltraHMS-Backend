/*
  Warnings:

  - The `status` column on the `Admission` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `VideoSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[id]` on the table `HospitalSettings` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentConfirmationStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "VideoSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- DropForeignKey
ALTER TABLE "Triage" DROP CONSTRAINT "Triage_nurseId_fkey";

-- AlterTable
ALTER TABLE "Admission" DROP COLUMN "status",
ADD COLUMN     "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITTED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "paymentStatus" "AppointmentPaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentConfirmationStatus" "PaymentConfirmationStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "paymentConfirmedById" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentNotes" TEXT,
ADD COLUMN     "paymentReference" TEXT;

-- AlterTable
ALTER TABLE "Triage" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "VideoSession" DROP COLUMN "status",
ADD COLUMN     "status" "VideoSessionStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSettings_id_key" ON "HospitalSettings"("id");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentConfirmedById_fkey" FOREIGN KEY ("paymentConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
