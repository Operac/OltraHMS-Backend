/**
 * Unified Invoice Helper - Ensures consistent billing across all services
 * Implements: tax calculation, validation, invoice linking, and payment gates
 */

import { prisma } from './prisma';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { randomBytes } from 'crypto';

// Generate unique invoice numbers with collision prevention
export const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

// Invoice item structure (used across all services)
export interface InvoiceItem {
    description: string;
    quantity: number;
    unitPrice: number;
    itemType?: string;  // LAB_TEST, MEDICATION, CONSULTATION, BED_ACCOMMODATION, etc.
    itemId?: string;    // Reference to service, medication, lab order, etc.
}

// Create invoice with unified validation and tax calculation
export interface CreateInvoiceInput {
    patientId: string;
    items: InvoiceItem[];
    medicalRecordId?: string;
    labOrderId?: string;
    radiologyRequestId?: string;
    prescriptionId?: string;
    appointmentId?: string;
    invoiceType?: 'STANDARD' | 'DEPOSIT';
    invoicePrefix?: string;
    tax?: number;  // Optional tax amount; if null, calculates as percentage
    taxPercentage?: number;  // Default 7.5% for Nigeria
}

export interface InvoiceCreationResult {
    id: string;
    invoiceNumber: string;
    total: number;
    balance: number;
    amountPaid: number;
    status: string;
}

/**
 * Create invoice with unified validation, tax calculation, and safeguards
 */
export const createInvoice = async (input: CreateInvoiceInput): Promise<InvoiceCreationResult> => {
    const {
        patientId,
        items,
        medicalRecordId,
        labOrderId,
        radiologyRequestId,
        prescriptionId,
        appointmentId,
        invoiceType = 'STANDARD',
        invoicePrefix = 'INV',
        taxPercentage = 7.5  // Nigeria VAT
    } = input;

    // Validation
    if (!patientId) throw new Error('Patient ID is required');
    if (!items || items.length === 0) throw new Error('At least one invoice item is required');

    // Validate patient exists
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new Error('Patient not found');

    // Validate service links
    if (medicalRecordId) {
        const record = await prisma.medicalRecord.findUnique({ where: { id: medicalRecordId } });
        if (!record) throw new Error('Medical record not found');
    }
    if (labOrderId) {
        const lab = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
        if (!lab) throw new Error('Lab order not found');
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const tax = (subtotal * taxPercentage) / 100;
    const total = subtotal + tax;

    // Check for duplicate invoices on same medical visit
    if (medicalRecordId) {
        const existingInvoice = await prisma.invoice.findFirst({
            where: {
                medicalRecordId,
                patientId,
                status: { not: 'PAID' }  // Don't link to paid invoices
            }
        });

        if (existingInvoice && existingInvoice.status !== 'PAID') {
            // Append to existing invoice instead of creating duplicate
            const existingItems = (existingInvoice.items as any) || [];
            const combinedItems = [...existingItems, ...items];
            const newSubtotal = combinedItems.reduce(
                (sum, item) => sum + (item.unitPrice * item.quantity),
                0
            );
            const newTax = (newSubtotal * taxPercentage) / 100;
            const newTotal = newSubtotal + newTax;

            const updated = await prisma.invoice.update({
                where: { id: existingInvoice.id },
                data: {
                    items: combinedItems,
                    subtotal: newSubtotal,
                    tax: newTax,
                    total: newTotal,
                    balance: newTotal - existingInvoice.amountPaid
                }
            });

            return {
                id: updated.id,
                invoiceNumber: updated.invoiceNumber,
                total: updated.total,
                balance: updated.balance,
                amountPaid: updated.amountPaid,
                status: updated.status
            };
        }
    }

    // Create new invoice
    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber: generateInvoiceNumber(invoicePrefix),
            patientId,
            medicalRecordId: medicalRecordId || null,
            labOrderId: labOrderId || null,
            radiologyRequestId: radiologyRequestId || null,
            prescriptionId: prescriptionId || null,
            appointmentId: appointmentId || null,
            items: items as any,
            subtotal,
            tax,
            total,
            balance: total,
            status: InvoiceStatus.ISSUED,
            type: invoiceType
        }
    });

    return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        balance: invoice.balance,
        amountPaid: invoice.amountPaid,
        status: invoice.status
    };
};

/**
 * Payment Gate - Used before rendering any service
 * Returns payment status or throws error
 */
export interface PaymentGate {
    isCleared: boolean;
    requiresPayment: boolean;
    message?: string;
    outstandingBalance?: number;
}

export const checkPaymentGate = async (
    patientId: string,
    serviceType: 'APPOINTMENT' | 'LAB' | 'PHARMACY' | 'SURGERY' | 'INPATIENT'
): Promise<PaymentGate> => {
    // Get most recent unpaid invoices for patient
    const unpaidInvoices = await prisma.invoice.findMany({
        where: {
            patientId,
            balance: { gt: 0 }  // Has outstanding balance
        },
        orderBy: { createdAt: 'desc' },
        take: 1
    });

    if (unpaidInvoices.length > 0) {
        const invoice = unpaidInvoices[0];
        return {
            isCleared: false,
            requiresPayment: true,
            message: `Payment required. Outstanding balance: ₦${invoice.balance.toLocaleString()}`,
            outstandingBalance: invoice.balance
        };
    }

    return {
        isCleared: true,
        requiresPayment: false,
        message: 'Payment cleared'
    };
};

/**
 * Verify payment before service is rendered
 * Throws error if payment not cleared or waived
 */
export const verifyPaymentBeforeService = async (
    patientId: string,
    serviceType: string,
    throwError: boolean = true
): Promise<boolean> => {
    const gate = await checkPaymentGate(patientId, serviceType as any);

    if (!gate.isCleared) {
        if (throwError) {
            const error: any = new Error(gate.message || 'Payment required');
            error.statusCode = 402;  // Payment Required HTTP status
            error.outstandingBalance = gate.outstandingBalance;
            throw error;
        }
        return false;
    }

    return true;
};

/**
 * Process payment safely with validation
 */
export interface ProcessPaymentInput {
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    processedById: string;
}

export const processPayment = async (input: ProcessPaymentInput) => {
    const { invoiceId, amount, method, reference, processedById } = input;

    // Fetch invoice
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new Error('Invoice not found');

    // Validate amount
    if (amount <= 0) throw new Error('Payment amount must be positive');
    if (amount > invoice.balance) {
        throw new Error(
            `Payment exceeds outstanding balance. Max: ₦${invoice.balance.toLocaleString()}`
        );
    }

    // Process payment in transaction
    return await prisma.$transaction(async (tx) => {
        // Create payment record
        const payment = await tx.payment.create({
            data: {
                invoiceId,
                amount,
                method,
                transactionReference: reference || `TXN-${Date.now()}`,
                status: 'COMPLETED',
                processedById
            }
        });

        // Update invoice
        const newAmountPaid = invoice.amountPaid + amount;
        const newBalance = invoice.total - newAmountPaid;
        const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

        const updated = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                amountPaid: newAmountPaid,
                balance: Math.max(newBalance, 0),
                status: newStatus
            }
        });

        return { payment, invoice: updated };
    });
};

/**
 * Create reference from service to invoice
 * Used for linking specific services to their invoices
 */
export const linkServiceToInvoice = async (
    serviceType: 'APPOINTMENT' | 'LAB' | 'PHARMACY' | 'PRESCRIPTION' | 'RADIOLOGY' | 'SURGERY',
    serviceId: string,
    invoiceId: string
) => {
    const field =
        serviceType === 'APPOINTMENT'
            ? 'appointmentId'
            : serviceType === 'LAB'
              ? 'labOrderId'
              : serviceType === 'RADIOLOGY'
                ? 'radiologyRequestId'
                : serviceType === 'PRESCRIPTION'
                  ? 'prescriptionId'
                  : null;

    if (!field) throw new Error(`Unknown service type: ${serviceType}`);

    // Update invoice with service link
    await prisma.invoice.update({
        where: { id: invoiceId },
        data: { [field]: serviceId }
    });
};
