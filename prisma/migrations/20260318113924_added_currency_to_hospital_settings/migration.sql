-- AlterTable
ALTER TABLE "HospitalSettings" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "currencySymbol" TEXT NOT NULL DEFAULT '₦';
