import {
    InvoiceStatus,
    PaymentConfirmationStatus,
    PaymentMethod,
    PaymentStatus,
    Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

type Transaction = Prisma.TransactionClient;

const assertPaymentAmount = (amount: number, balance: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
    }
    if (amount > balance) {
        throw new Error(`Payment amount exceeds outstanding balance. Max payable: ₦${balance.toLocaleString()}`);
    }
};

type LinkedServiceStatus = 'CLEARED' | 'AWAITING_PAYMENT';

const getItemLink = (item: unknown): { type?: string; id?: string } => {
    if (!item || typeof item !== 'object') return {};
    const value = item as Record<string, unknown>;
    const type = value.itemType ?? value.type;
    const id = value.itemId ?? value.serviceInstanceId;
    return {
        type: typeof type === 'string' ? type.toUpperCase() : undefined,
        id: typeof id === 'string' ? id : undefined,
    };
};

/** Keep every concrete clinical service covered by an invoice in sync. */
export const syncLinkedServicesPaymentStatus = async (
    tx: Transaction,
    invoiceId: string,
    userId: string,
    status: LinkedServiceStatus,
) => {
    const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
            appointmentId: true,
            labOrderId: true,
            prescriptionId: true,
            radiologyRequestId: true,
            admissionId: true,
            surgeryCaseId: true,
            items: true,
        },
    });
    if (!invoice) throw new Error('Invoice not found');

    const staff = await tx.staff.findUnique({ where: { userId }, select: { id: true } });
    const paymentData = status === 'CLEARED'
        ? { paymentStatus: status, clearedAt: new Date(), clearedById: staff?.id ?? null }
        : { paymentStatus: status, clearedAt: null, clearedById: null };

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const isAdmissionDeposit = items.some((item) => getItemLink(item).type === 'ADMISSION_DEPOSIT');
    const ids = {
        appointment: new Set<string>(invoice.appointmentId ? [invoice.appointmentId] : []),
        lab: new Set<string>(invoice.labOrderId ? [invoice.labOrderId] : []),
        prescription: new Set<string>(invoice.prescriptionId ? [invoice.prescriptionId] : []),
        radiology: new Set<string>(invoice.radiologyRequestId ? [invoice.radiologyRequestId] : []),
        admission: new Set<string>(invoice.admissionId && !isAdmissionDeposit ? [invoice.admissionId] : []),
        surgery: new Set<string>(invoice.surgeryCaseId ? [invoice.surgeryCaseId] : []),
    };

    for (const item of items) {
        const link = getItemLink(item);
        if (!link.id || !link.type) continue;
        if (['APPOINTMENT', 'CONSULTATION', 'TELEMEDICINE'].includes(link.type)) ids.appointment.add(link.id);
        if (['LAB', 'LAB_TEST'].includes(link.type)) ids.lab.add(link.id);
        if (['PHARMACY', 'MEDICATION', 'PRESCRIPTION'].includes(link.type)) ids.prescription.add(link.id);
        if (['RADIOLOGY', 'IMAGING'].includes(link.type)) ids.radiology.add(link.id);
        if (['ADMISSION', 'INPATIENT', 'BED_ACCOMMODATION', 'DEPOSIT'].includes(link.type)) ids.admission.add(link.id);
        if (['SURGERY', 'PROCEDURE'].includes(link.type)) ids.surgery.add(link.id);
    }

    await Promise.all([
        ids.appointment.size ? tx.appointment.updateMany({ where: { id: { in: [...ids.appointment] } }, data: paymentData }) : undefined,
        ids.lab.size ? tx.labOrder.updateMany({ where: { id: { in: [...ids.lab] } }, data: paymentData }) : undefined,
        ids.prescription.size ? tx.prescription.updateMany({ where: { id: { in: [...ids.prescription] } }, data: paymentData }) : undefined,
        ids.radiology.size ? tx.radiologyRequest.updateMany({ where: { id: { in: [...ids.radiology] } }, data: paymentData }) : undefined,
        ids.admission.size ? tx.admission.updateMany({ where: { id: { in: [...ids.admission] } }, data: paymentData }) : undefined,
        ids.surgery.size ? tx.surgeryCase.updateMany({ where: { id: { in: [...ids.surgery] } }, data: paymentData }) : undefined,
    ]);
};

export interface RecordPaymentInput {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    processedById: string;
}

export const recordInvoicePayment = async (input: RecordPaymentInput) => {
    return prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.balance <= 0 || invoice.status === InvoiceStatus.PAID) {
            throw new Error('Invoice is already fully paid');
        }

        assertPaymentAmount(input.amount, invoice.balance);

        if (input.reference) {
            const duplicate = await tx.payment.findFirst({
                where: { transactionReference: input.reference, status: PaymentStatus.COMPLETED },
                select: { id: true },
            });
            if (duplicate) throw new Error('This payment reference has already been used');
        }

        const payment = await tx.payment.create({
            data: {
                invoiceId: invoice.id,
                amount: input.amount,
                method: input.method,
                transactionReference: input.reference || `TX-${Date.now()}`,
                status: PaymentStatus.COMPLETED,
                processedById: input.processedById,
            },
        });

        const newAmountPaid = invoice.amountPaid + input.amount;
        const newBalance = Math.max(invoice.total - newAmountPaid, 0);
        const newStatus = newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
        const updatedInvoice = await tx.invoice.update({
            where: { id: invoice.id },
            data: {
                amountPaid: newAmountPaid,
                balance: newBalance,
                status: newStatus,
                paymentConfirmationStatus: PaymentConfirmationStatus.CONFIRMED,
                paymentConfirmedAt: new Date(),
                paymentConfirmedById: input.processedById,
                submittedAmount: null,
            },
        });

        if (newBalance === 0) await syncLinkedServicesPaymentStatus(tx, invoice.id, input.processedById, 'CLEARED');
        return { payment, invoice: updatedInvoice };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

export const confirmSubmittedPayment = async (
    invoiceId: string,
    processedById: string,
    notes?: string,
) => {
    return prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new Error('Invoice not found');
        if (invoice.paymentConfirmationStatus !== PaymentConfirmationStatus.AWAITING_CONFIRMATION) {
            throw new Error('This payment is not awaiting confirmation');
        }
        if (!invoice.submittedAmount || !invoice.paymentReference || !invoice.paymentMethod) {
            throw new Error('Submitted payment details are incomplete');
        }

        assertPaymentAmount(invoice.submittedAmount, invoice.balance);
        const duplicate = await tx.payment.findFirst({
            where: { transactionReference: invoice.paymentReference, status: PaymentStatus.COMPLETED },
            select: { id: true },
        });
        if (duplicate) throw new Error('This payment reference has already been confirmed');

        const payment = await tx.payment.create({
            data: {
                invoiceId,
                amount: invoice.submittedAmount,
                method: invoice.paymentMethod,
                transactionReference: invoice.paymentReference,
                status: PaymentStatus.COMPLETED,
                processedById,
            },
        });

        const newAmountPaid = invoice.amountPaid + invoice.submittedAmount;
        const newBalance = Math.max(invoice.total - newAmountPaid, 0);
        const updatedInvoice = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                amountPaid: newAmountPaid,
                balance: newBalance,
                status: newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
                paymentConfirmationStatus: PaymentConfirmationStatus.CONFIRMED,
                paymentConfirmedAt: new Date(),
                paymentConfirmedById: processedById,
                paymentNotes: notes,
                submittedAmount: null,
            },
        });

        if (newBalance === 0) await syncLinkedServicesPaymentStatus(tx, invoiceId, processedById, 'CLEARED');
        return { payment, invoice: updatedInvoice };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};
