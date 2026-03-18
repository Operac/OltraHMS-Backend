-- AlterTable
ALTER TABLE "PatientInsurance" ADD COLUMN     "planName" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;
