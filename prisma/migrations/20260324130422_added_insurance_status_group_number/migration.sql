-- AlterEnum
ALTER TYPE "InsuranceStatus" ADD VALUE 'ACTIVE';

-- AlterTable
ALTER TABLE "PatientInsurance" ADD COLUMN     "coveragePercentage" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "groupNumber" TEXT;
