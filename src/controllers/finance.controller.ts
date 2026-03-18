import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

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
        // Validate input with Zod
        const validatedData = processPaymentSchema.parse(req.body);
        const { invoiceId, amount, method, reference } = validatedData;
        
        // Get the numeric amount
        const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount);

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment Record
            const payment = await tx.payment.create({
                data: {
                    invoiceId,
                    amount: numericAmount,
                    method,
                    transactionReference: reference || `REF-${Date.now()}`,
                    status: 'COMPLETED',
                    processedById: req.user!.id
                }
            });

            // 2. Update Invoice Status
            const newAmountPaid = invoice.amountPaid + numericAmount;
            const newBalance = invoice.total - newAmountPaid;
            
            const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

            await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: newBalance,
                    status: newStatus
                }
            });

            // 3. Log Audit
            await tx.auditLog.create({
                data: {
                    userId: req.user!.id,
                    action: 'PROCESS_PAYMENT',
                    entityType: 'Invoice',
                    entityId: invoiceId,
                    details: `Processed payment of ${amount} via ${method}`
                }
            });

            return { payment, newStatus };
        });

        res.json(result);
    } catch (error) {
        console.error("Payment Error:", error);
        res.status(500).json({ message: 'Failed to process payment' });
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
                    status: 'COMPLETED',
                    processedById: req.user!.id
                }
            });

            // 2. Update Invoice
            const newAmountPaid = invoice.amountPaid - refundAmount;
            const newBalance = invoice.total - newAmountPaid;
            
            const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

            await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: newBalance,
                    status: newStatus
                }
            });

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
