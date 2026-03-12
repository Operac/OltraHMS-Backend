-- AlterTable
ALTER TABLE "Bed" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "InventoryBatch" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "salaryCurrency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "Ward" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ALTER COLUMN "basePrice" SET DEFAULT 0;
