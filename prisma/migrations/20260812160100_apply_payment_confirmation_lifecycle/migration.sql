ALTER TABLE "Invoice"
ALTER COLUMN "paymentConfirmationStatus" SET DEFAULT 'NOT_SUBMITTED';

UPDATE "Invoice"
SET "paymentConfirmationStatus" = 'NOT_SUBMITTED'
WHERE "paymentConfirmationStatus" = 'AWAITING_CONFIRMATION'
  AND "submittedAmount" IS NULL
  AND "paymentReference" IS NULL;
