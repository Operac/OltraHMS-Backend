import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';
import { InvoiceStatus, PaymentMethod, PaymentStatus, InsuranceStatus, PaymentConfirmationStatus, Role } from '@prisma/client';
import { randomBytes } from 'crypto';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
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
            include: { 
                payments: true,
                patient: {
                    include: {
                        insurancePolicies: {
                            where: { status: { in: [InsuranceStatus.ACTIVE, InsuranceStatus.VERIFIED] }},
                            orderBy: { createdAt: 'desc' },
                            take: 1
                        }
                    }
                }
            }
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

// --- Payment Confirmation Workflow ---

/**
 * Patient submits payment details (for cash or bank transfer)
 * This creates a pending payment awaiting admin confirmation
 */
export const submitPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { invoiceId, method, reference, amount } = req.body;
        
        // Validate submitted amount is positive
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Payment amount must be greater than zero' });
        }

        const patient = await prisma.patient.findFirst({ where: { userId } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        // Verify invoice belongs to patient
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId }
        });
        if (!invoice || invoice.patientId !== patient.id) {
            return res.status(403).json({ message: 'Invoice not found or unauthorized' });
        }

        // Validate submitted amount doesn't exceed balance
        if (amount > invoice.balance) {
            return res.status(400).json({ 
                message: `Payment amount exceeds balance. Outstanding balance: ₦${invoice.balance.toLocaleString()}` 
            });
        }

        // Update invoice with payment details - STORE SUBMITTED AMOUNT
        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                paymentMethod: method,
                paymentReference: reference || `PAY-${Date.now()}`,
                paymentConfirmationStatus: PaymentConfirmationStatus.AWAITING_CONFIRMATION,
                submittedAmount: amount  // Store the actual payment amount submitted
            }
        });

        res.json({ 
            message: 'Payment submitted. Awaiting confirmation from staff.', 
            invoice: updatedInvoice 
        });
    } catch (error) {
        console.error('Submit Payment Error:', error);
        res.status(500).json({ message: 'Failed to submit payment' });
    }
};

/**
 * Admin/Accountant confirms a payment
 */
export const confirmPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { invoiceId, action, notes } = req.body;
        // action: 'CONFIRM' or 'REJECT'

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: {
                id: true,
                total: true,
                balance: true,
                amountPaid: true,
                submittedAmount: true,  // Get the amount patient submitted
                paymentMethod: true,
                paymentReference: true,
                patientId: true,
                patient: true
            }
        });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

        if (action === 'REJECT') {
            const updated = await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    paymentConfirmationStatus: PaymentConfirmationStatus.REJECTED,
                    paymentNotes: notes || 'Payment rejected',
                    submittedAmount: null  // Clear submitted amount on rejection
                }
            });
            return res.json({ message: 'Payment rejected', invoice: updated });
        }

        // CONFIRM action - use SUBMITTED amount, not invoice total
        const confirmedAmount = invoice.submittedAmount || invoice.total;
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update invoice confirmation status
            const updatedInvoice = await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    paymentConfirmationStatus: PaymentConfirmationStatus.CONFIRMED,
                    paymentConfirmedAt: new Date(),
                    paymentConfirmedById: userId,
                    paymentNotes: notes
                }
            });

            // 2. Create Payment record (use submitted amount, not total)
            const payment = await tx.payment.create({
                data: {
                    invoiceId,
                    amount: confirmedAmount,  // Use submitted amount
                    method: invoice.paymentMethod || PaymentMethod.CASH,
                    transactionReference: invoice.paymentReference || `PAY-${Date.now()}`,
                    status: PaymentStatus.COMPLETED,
                    processedById: userId
                }
            });

            // 3. Update invoice payment status
            const newAmountPaid = invoice.amountPaid + confirmedAmount;
            const newBalance = invoice.total - newAmountPaid;
            const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
            
            await tx.invoice.update({
                where: { id: invoiceId },
                data: {
                    amountPaid: newAmountPaid,
                    balance: Math.max(newBalance, 0),  // Prevent negative balance
                    status: newStatus,
                    submittedAmount: null  // Clear after processing
                }
            });

            // 4. Unlock linked services — set paymentStatus → CLEARED
            const fullInvoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                select: { appointmentId: true, labOrderId: true, prescriptionId: true }
            });

            if (fullInvoice) {
                // Get accountant staff ID for clearedById
                const accountant = await tx.staff.findUnique({ where: { userId } });

                if (fullInvoice.appointmentId) {
                    await tx.appointment.update({
                        where: { id: fullInvoice.appointmentId },
                        data: {
                            paymentStatus: 'CLEARED',
                            clearedAt: new Date(),
                            clearedById: accountant?.id
                        }
                    });
                }
                if (fullInvoice.labOrderId) {
                    await tx.labOrder.update({
                        where: { id: fullInvoice.labOrderId },
                        data: {
                            paymentStatus: 'CLEARED',
                            clearedAt: new Date(),
                            clearedById: accountant?.id
                        }
                    });
                }
                if (fullInvoice.prescriptionId) {
                    await tx.prescription.update({
                        where: { id: fullInvoice.prescriptionId },
                        data: {
                            paymentStatus: 'CLEARED',
                            clearedAt: new Date(),
                            clearedById: accountant?.id
                        }
                    });
                }
            }

            return { invoice: updatedInvoice, payment };
        });

        res.json({ message: 'Payment confirmed successfully', result });
    } catch (error) {
        console.error('Confirm Payment Error:', error);
        res.status(500).json({ message: 'Failed to confirm payment' });
    }
};

/**
 * Get all invoices awaiting payment confirmation (for admin dashboard)
 */
export const getPendingPayments = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        // Only admin and accountant can view pending payments
        if (user.role !== Role.ADMIN && user.role !== Role.ACCOUNTANT) {
            return res.status(403).json({ message: 'Only admin or accountant can view pending payments' });
        }

        const invoices = await prisma.invoice.findMany({
            where: {
                paymentConfirmationStatus: PaymentConfirmationStatus.AWAITING_CONFIRMATION,
                status: { in: ['ISSUED', 'DRAFT'] }
            },
            include: {
                patient: { 
                    select: { firstName: true, lastName: true, patientNumber: true, phone: true } 
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(invoices);
    } catch (error) {
        console.error('Get Pending Payments Error:', error);
        res.status(500).json({ message: 'Failed to fetch pending payments' });
    }
};
