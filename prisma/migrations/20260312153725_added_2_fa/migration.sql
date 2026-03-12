-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorBackupCodes" TEXT,
ADD COLUMN     "twoFactorSecret" TEXT;
