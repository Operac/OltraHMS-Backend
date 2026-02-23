import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get Pending Invoices (Accountant View)
 */
export const getPendingInvoices = async (req: AuthRequest, res: Response) => {
    try {
        const invoices = await prisma.invoice.findMany({
            where: { 
                status: { in: ['ISSUED', 'PARTIAL'] }
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch pending invoices' });
    }
};

/**
 * Process Payment (Cash/Card/etc)
 */
export const processPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { invoiceId, amount, method, reference } = req.body;

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Payment Record
            const payment = await tx.payment.create({
                data: {
                    invoiceId,
                    amount: parseFloat(amount),
                    method,
                    transactionReference: reference || `REF-${Date.now()}`,
                    status: 'COMPLETED',
                    processedById: req.user!.id
                }
            });

            // 2. Update Invoice Status
            const newAmountPaid = invoice.amountPaid + parseFloat(amount);
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
