ALTER TABLE "Invoice"
ADD COLUMN "admissionId" TEXT,
ADD COLUMN "surgeryCaseId" TEXT;

ALTER TABLE "Admission"
ADD COLUMN "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "clearedById" TEXT,
ADD COLUMN "waiverReason" TEXT;

ALTER TABLE "SurgeryCase"
ADD COLUMN "procedureServiceId" TEXT,
ADD COLUMN "paymentStatus" "ServicePaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "clearedById" TEXT,
ADD COLUMN "waiverReason" TEXT;

CREATE INDEX "Invoice_admissionId_idx" ON "Invoice"("admissionId");
CREATE INDEX "Invoice_surgeryCaseId_idx" ON "Invoice"("surgeryCaseId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_admissionId_fkey"
FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_surgeryCaseId_fkey"
FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_clearedById_fkey"
FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_procedureServiceId_fkey"
FOREIGN KEY ("procedureServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_clearedById_fkey"
FOREIGN KEY ("clearedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
