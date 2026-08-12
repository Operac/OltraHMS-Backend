import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { InvoiceStatus, PaymentConfirmationStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { recordInvoicePayment, syncLinkedServicesPaymentStatus } from '../services/payment.service';

// Validation schema for processing payment
const processPaymentSchema = z.object({
    invoiceId: z.string().uuid({ message: 'Invalid invoice ID' }),
    amount: z.union([
        z.number().positive(),
        z.string().transform((val) => parseFloat(val)).refine((val) => val > 0, { message: 'Amount must be positive' })
    ]),
    method: z.nativeEnum(PaymentMethod),
    reference: z.string().optional()
});

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

/**
 * Get Invoices (with optional status filter)
 */
export const getPendingInvoices = async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.query;
        
        let whereClause: any = {};
        
        if (status) {
            // Allow filtering by specific status
            whereClause.status = String(status);
        } else {
            // Default: get pending invoices
            whereClause.status = { in: ['ISSUED', 'PARTIAL'] };
        }
        
        const invoices = await prisma.invoice.findMany({
            where: whereClause,
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch invoices' });
    }
};

/**
 * Process Payment (Cash/Card/etc)
 */
export const processPayment = async (req: AuthRequest, res: Response) => {
    try {
        const validatedData = processPaymentSchema.parse(req.body);
        const { invoiceId, amount, method, reference } = validatedData;
        const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount);
        const result = await recordInvoicePayment({
            invoiceId,
            amount: numericAmount,
            method,
            reference,
            processedById: req.user!.id,
        });

        res.json({ message: 'Payment recorded successfully', result });
    } catch (error) {
        console.error("Payment Error:", error);
        const message = error instanceof Error ? error.message : 'Failed to process payment';
        res.status(error instanceof z.ZodError ? 400 : 409).json({ message });
    }
};

/**
 * Process Refund (for overpaid or cancelled services)
 */
export const processRefund = async (req: AuthRequest, res: Response) => {
    try {
        const { invoiceId, amount, reason } = req.body;

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const refundAmount = parseFloat(amount);
        const maxRefundable = invoice.amountPaid;

        // Validate refund amount
        if (refundAmount <= 0) {
            return res.status(400).json({ message: 'Refund amount must be greater than zero' });
        }

        if (refundAmount > maxRefundable) {
            return res.status(400).json({ 
                message: `Maximum refundable amount is ₦${maxRefundable}. Cannot refund more than amount paid.` 
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Refund Record (negative payment)
            const refund = await tx.payment.create({
                data: {
                    invoiceId,
                    amount: -refundAmount, // Negative for refund
                    method: 'CASH', // Refund via cash or original method
                    transactionReference: `REFUND-${Date.now()}`,
                    status: PaymentStatus.REFUNDED,
                    processedById: req.user!.id
                }
            });

            // 2. Update Invoice with balance check to prevent negative
            const newAmountPaid = invoice.amountPaid - refundAmount;
            const newBalance = invoice.total - newAmountPaid;
            
            if (newBalance < 0) {
                throw new Error('Refund would create negative balance. Please verify invoice total.');
            }
            
            const newStatus = newAmountPaid === 0 ? InvoiceStatus.REFUNDED : InvoiceStatus.PARTIAL;

            await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: Math.max(newBalance, 0),  // Prevent negative balance
                    status: newStatus,
                    paymentConfirmationStatus: PaymentConfirmationStatus.NOT_SUBMITTED,
                    paymentConfirmedAt: null,
                    paymentConfirmedById: null,
                }
            });

            // A refund reopens every service covered by the invoice, including
            // aggregate invoices whose links live in their item metadata.
            await syncLinkedServicesPaymentStatus(tx, invoiceId, req.user!.id, 'AWAITING_PAYMENT');

            // 3. Log Audit
            await tx.auditLog.create({
                data: {
                    userId: req.user!.id,
                    action: 'PROCESS_REFUND',
                    entityType: 'Invoice',
                    entityId: invoiceId,
                    details: `Processed refund of ₦${refundAmount}. Reason: ${reason || 'Not specified'}`
                }
            });

            return { refund, newStatus };
        });

        res.json({ message: 'Refund processed successfully', ...result });
    } catch (error) {
        console.error("Refund Error:", error);
        res.status(500).json({ message: 'Failed to process refund' });
    }
};
