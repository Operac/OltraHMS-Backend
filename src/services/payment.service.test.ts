import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, PaymentConfirmationStatus, PaymentMethod } from '@prisma/client';

const { tx, prismaMock } = vi.hoisted(() => {
    const tx = {
        invoice: { findUnique: vi.fn(), update: vi.fn() },
        payment: { findFirst: vi.fn(), create: vi.fn() },
        staff: { findUnique: vi.fn() },
        appointment: { updateMany: vi.fn() },
        labOrder: { updateMany: vi.fn() },
        prescription: { updateMany: vi.fn() },
        radiologyRequest: { updateMany: vi.fn() },
        admission: { updateMany: vi.fn() },
        surgeryCase: { updateMany: vi.fn() },
    };
    return {
        tx,
        prismaMock: {
            $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
        },
    };
});

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { confirmSubmittedPayment, recordInvoicePayment } from './payment.service';

const invoice = {
    id: 'invoice-1',
    total: 100,
    balance: 100,
    amountPaid: 0,
    status: InvoiceStatus.ISSUED,
    paymentConfirmationStatus: PaymentConfirmationStatus.NOT_SUBMITTED,
    submittedAmount: null,
    paymentReference: null,
    paymentMethod: null,
};

describe('payment service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.invoice.findUnique.mockResolvedValue(invoice);
        tx.payment.findFirst.mockResolvedValue(null);
        tx.payment.create.mockResolvedValue({ id: 'payment-1' });
        tx.invoice.update.mockResolvedValue({ ...invoice, status: InvoiceStatus.PAID, balance: 0 });
        tx.staff.findUnique.mockResolvedValue({ id: 'staff-1' });
    });

    it('rejects overpayment before writing a payment', async () => {
        await expect(recordInvoicePayment({ invoiceId: invoice.id, amount: 101, method: PaymentMethod.CASH, processedById: 'user-1' }))
            .rejects.toThrow('exceeds outstanding balance');
        expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('records a full staff payment and clears linked services', async () => {
        tx.invoice.findUnique
            .mockResolvedValueOnce({ ...invoice })
            .mockResolvedValueOnce({
                appointmentId: 'appointment-1', labOrderId: 'lab-1', prescriptionId: 'rx-1',
                radiologyRequestId: 'rad-1', admissionId: 'admission-1', surgeryCaseId: 'surgery-1',
                items: [],
            });

        await recordInvoicePayment({ invoiceId: invoice.id, amount: 100, method: PaymentMethod.CASH, processedById: 'user-1' });

        expect(tx.payment.create).toHaveBeenCalledOnce();
        expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ balance: 0, status: InvoiceStatus.PAID }) }));
        expect(tx.appointment.updateMany).toHaveBeenCalledOnce();
        expect(tx.labOrder.updateMany).toHaveBeenCalledOnce();
        expect(tx.prescription.updateMany).toHaveBeenCalledOnce();
        expect(tx.radiologyRequest.updateMany).toHaveBeenCalledOnce();
        expect(tx.admission.updateMany).toHaveBeenCalledOnce();
        expect(tx.surgeryCase.updateMany).toHaveBeenCalledOnce();
    });

    it('requires a genuinely submitted payment before confirmation', async () => {
        await expect(confirmSubmittedPayment(invoice.id, 'user-1')).rejects.toThrow('not awaiting confirmation');
        expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('confirms only the submitted partial amount', async () => {
        tx.invoice.findUnique.mockResolvedValue({
            ...invoice,
            paymentConfirmationStatus: PaymentConfirmationStatus.AWAITING_CONFIRMATION,
            submittedAmount: 40,
            paymentReference: 'BANK-REF-1',
            paymentMethod: PaymentMethod.BANK_TRANSFER,
        });

        await confirmSubmittedPayment(invoice.id, 'user-1');

        expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 40 }) }));
        expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountPaid: 40, balance: 60, status: InvoiceStatus.PARTIAL }) }));
        expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    });
});
