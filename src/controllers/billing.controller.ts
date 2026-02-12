import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

export const getPatientInvoices = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const patient = await prisma.patient.findFirst({ where: { userId } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        const invoices = await prisma.invoice.findMany({
            where: { patientId: patient.id },
            include: { 
                medicalRecord: {
                    select: { visitDate: true, doctor: { include: { user: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(invoices);
    } catch (error) {
        console.error('Get Invoices Error:', error);
        res.status(500).json({ message: 'Failed to fetch invoices' });
    }
};

export const getInvoiceById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const invoice = await prisma.invoice.findUnique({
            where: { id },
            include: { payments: true }
        });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch invoice' });
    }
};

const paymentSchema = z.object({
    invoiceId: z.string(),
    amount: z.number().positive(),
    method: z.nativeEnum(PaymentMethod)
});

export const processPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const data = paymentSchema.parse(req.body);

        const invoice = await prisma.invoice.findUnique({
            where: { id: data.invoiceId }
        });

        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.status === 'PAID') return res.status(400).json({ message: 'Invoice is already fully paid' });

        // Simulate successful payment processing
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment Record
            const payment = await tx.payment.create({
                data: {
                    invoiceId: data.invoiceId,
                    amount: data.amount,
                    method: data.method,
                    status: PaymentStatus.COMPLETED,
                    processedById: userId, // Self-payment or processed by system user
                    transactionReference: `TX-${Date.now()}`
                }
            });

            // 2. Update Invoice Status
            const newAmountPaid = invoice.amountPaid + data.amount;
            const newBalance = invoice.total - newAmountPaid;
            let newStatus = invoice.status;

            if (newBalance <= 0) newStatus = InvoiceStatus.PAID;
            else if (newAmountPaid > 0) newStatus = InvoiceStatus.PARTIAL;

            await tx.invoice.update({
                where: { id: data.invoiceId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: newBalance > 0 ? newBalance : 0,
                    status: newStatus
                }
            });

            return payment;
        });

        res.json({ message: 'Payment successful', payment: result });

    } catch (error) {
        console.error('Payment Error:', error);
        res.status(500).json({ message: 'Payment processing failed' });
    }
};
