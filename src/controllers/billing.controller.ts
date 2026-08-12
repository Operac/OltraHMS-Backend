import { Request, Response } from 'express';
import {
    InsuranceStatus,
    PaymentConfirmationStatus,
    PaymentMethod,
    Role,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { confirmSubmittedPayment, recordInvoicePayment } from '../services/payment.service';

const paymentSchema = z.object({
    invoiceId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    method: z.nativeEnum(PaymentMethod),
    reference: z.string().trim().min(3).max(100).optional(),
});

const submissionSchema = paymentSchema.pick({ invoiceId: true, amount: true }).extend({
    method: z.enum([PaymentMethod.BANK_TRANSFER, PaymentMethod.CASH]),
    reference: z.string().trim().min(4).max(100),
});

const confirmationSchema = z.object({
    invoiceId: z.string().uuid(),
    action: z.enum(['CONFIRM', 'REJECT']),
    notes: z.string().trim().max(500).optional(),
});

const clientError = (error: unknown) => {
    if (error instanceof z.ZodError) return error.issues[0]?.message || 'Invalid payment details';
    if (error instanceof Error) return error.message;
    return 'Payment request failed';
};

export const getPatientInvoices = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const patient = await prisma.patient.findFirst({ where: { userId } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        const invoices = await prisma.invoice.findMany({
            where: { patientId: patient.id },
            include: {
                medicalRecord: { select: { visitDate: true, doctor: { include: { user: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(invoices);
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ message: 'Failed to fetch invoices' });
    }
};

export const getInvoiceById = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const invoice = await prisma.invoice.findUnique({
            where: { id },
            include: {
                payments: true,
                patient: {
                    include: {
                        insurancePolicies: {
                            where: { status: { in: [InsuranceStatus.ACTIVE, InsuranceStatus.VERIFIED] } },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        if (req.user?.role === Role.PATIENT) {
            const patient = await prisma.patient.findFirst({ where: { userId: req.user.id } });
            if (!patient || patient.id !== invoice.patientId) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }
        res.json(invoice);
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({ message: 'Failed to fetch invoice' });
    }
};

export const processPayment = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });
        const data = paymentSchema.parse(req.body);
        const result = await recordInvoicePayment({ ...data, processedById: req.user.id });
        res.json({ message: 'Payment recorded successfully', result });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(error instanceof z.ZodError ? 400 : 409).json({ message: clientError(error) });
    }
};

export const submitPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const data = submissionSchema.parse(req.body);
        const patient = await prisma.patient.findFirst({ where: { userId } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        const invoice = await prisma.invoice.findUnique({ where: { id: data.invoiceId } });
        if (!invoice || invoice.patientId !== patient.id) {
            return res.status(404).json({ message: 'Invoice not found' });
        }
        if (invoice.balance <= 0) return res.status(400).json({ message: 'Invoice is already fully paid' });
        if (data.amount > invoice.balance) {
            return res.status(400).json({ message: `Payment exceeds outstanding balance of ₦${invoice.balance.toLocaleString()}` });
        }
        if (invoice.paymentConfirmationStatus === PaymentConfirmationStatus.AWAITING_CONFIRMATION) {
            return res.status(409).json({ message: 'A payment is already awaiting confirmation' });
        }

        const referenceInUse = await prisma.payment.findFirst({
            where: { transactionReference: data.reference },
            select: { id: true },
        });
        if (referenceInUse) return res.status(409).json({ message: 'This payment reference has already been used' });

        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                paymentMethod: data.method,
                paymentReference: data.reference,
                paymentConfirmationStatus: PaymentConfirmationStatus.AWAITING_CONFIRMATION,
                submittedAmount: data.amount,
                paymentNotes: null,
            },
        });
        res.json({ message: 'Payment submitted. Awaiting confirmation from finance staff.', invoice: updatedInvoice });
    } catch (error) {
        console.error('Submit payment error:', error);
        res.status(error instanceof z.ZodError ? 400 : 500).json({ message: clientError(error) });
    }
};

export const confirmPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const data = confirmationSchema.parse(req.body);
        const invoice = await prisma.invoice.findUnique({ where: { id: data.invoiceId } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.paymentConfirmationStatus !== PaymentConfirmationStatus.AWAITING_CONFIRMATION) {
            return res.status(409).json({ message: 'This payment is not awaiting confirmation' });
        }

        if (data.action === 'REJECT') {
            const updated = await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    paymentConfirmationStatus: PaymentConfirmationStatus.REJECTED,
                    paymentNotes: data.notes || 'Payment rejected',
                    submittedAmount: null,
                },
            });
            return res.json({ message: 'Payment rejected', invoice: updated });
        }

        const result = await confirmSubmittedPayment(invoice.id, userId, data.notes);
        res.json({ message: 'Payment confirmed successfully', result });
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(error instanceof z.ZodError ? 400 : 409).json({ message: clientError(error) });
    }
};

export const getPendingPayments = async (req: AuthRequest, res: Response) => {
    try {
        const invoices = await prisma.invoice.findMany({
            where: {
                paymentConfirmationStatus: PaymentConfirmationStatus.AWAITING_CONFIRMATION,
                submittedAmount: { not: null },
                status: { in: ['ISSUED', 'PARTIAL'] },
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true, phone: true } },
            },
            orderBy: { updatedAt: 'asc' },
        });
        res.json(invoices);
    } catch (error) {
        console.error('Get pending payments error:', error);
        res.status(500).json({ message: 'Failed to fetch pending payments' });
    }
};
