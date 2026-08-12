UPDATE "Invoice"
SET "paymentConfirmationStatus" = 'NOT_SUBMITTED',
    "paymentReference" = NULL
WHERE "paymentConfirmationStatus" = 'AWAITING_CONFIRMATION'
  AND "submittedAmount" IS NULL;
