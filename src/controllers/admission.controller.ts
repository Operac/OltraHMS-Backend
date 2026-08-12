import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { PaymentMethod } from '@prisma/client';
import { recordInvoicePayment } from '../services/payment.service';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

const admitSchema = z.object({
    patientId: z.string(),
    wardId: z.string(),
    bedId: z.string().uuid(),
    reason: z.string(),
    estimatedDuration: z.number().optional(), // days
});

const depositSchema = z.object({
    patientId: z.string().uuid(),
    bedId: z.string().uuid(),
});

const depositPaymentSchema = z.object({
    invoiceId: z.string().uuid(),
    method: z.nativeEnum(PaymentMethod),
    reference: z.string().trim().min(1).optional(),
});

export const createAdmissionDeposit = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, bedId } = depositSchema.parse(req.body);
        const [patient, bed] = await Promise.all([
            prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }),
            prisma.bed.findUnique({ where: { id: bedId }, include: { ward: true } }),
        ]);
        if (!patient) return res.status(404).json({ message: 'Patient not found' });
        if (!bed) return res.status(404).json({ message: 'Bed not found' });
        if (bed.status !== 'VACANT_CLEAN') return res.status(409).json({ message: 'Bed is no longer available' });

        const depositAmount = bed.price ?? bed.ward.basePrice;
        if (!depositAmount || depositAmount <= 0) {
            return res.status(400).json({ message: 'Bed or ward price must be configured before collecting a deposit' });
        }

        const existingInvoice = await prisma.invoice.findFirst({
            where: {
                patientId,
                admissionId: null,
                type: 'DEPOSIT',
                status: { in: ['ISSUED', 'PARTIAL', 'PAID'] },
                items: { array_contains: [{ bedId: bed.id }] },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (existingInvoice) {
            return res.json({ invoice: existingInvoice, depositRequired: existingInvoice.total });
        }

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber('DEP-ADM'),
                patientId,
                type: 'DEPOSIT',
                status: 'ISSUED',
                items: [{ itemType: 'ADMISSION_DEPOSIT', description: `Admission deposit - ${bed.ward.name}, Bed ${bed.number}`, quantity: 1, unitPrice: depositAmount, total: depositAmount, bedId: bed.id }],
                subtotal: depositAmount,
                tax: 0,
                total: depositAmount,
                balance: depositAmount,
            },
        });
        res.status(201).json({ invoice, depositRequired: depositAmount });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: 'Invalid deposit request', errors: error.flatten().fieldErrors });
        console.error('Create Admission Deposit Error:', error);
        res.status(500).json({ message: 'Failed to create admission deposit' });
    }
};

export const payAdmissionDeposit = async (req: AuthRequest, res: Response) => {
    try {
        const { invoiceId, method, reference } = depositPaymentSchema.parse(req.body);
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

        if (!invoice || invoice.type !== 'DEPOSIT') {
            return res.status(404).json({ message: 'Admission deposit invoice not found' });
        }

        const items = Array.isArray(invoice.items) ? invoice.items : [];
        const isAdmissionDeposit = items.some((item: any) => item?.itemType === 'ADMISSION_DEPOSIT');
        if (!isAdmissionDeposit) {
            return res.status(400).json({ message: 'This invoice is not an admission deposit' });
        }

        if (invoice.status === 'PAID' || invoice.balance <= 0) {
            return res.json({ message: 'Admission deposit is already paid', invoice });
        }

        const result = await recordInvoicePayment({
            invoiceId,
            amount: invoice.balance,
            method,
            reference,
            processedById: req.user!.id,
        });
        res.json({ message: 'Admission deposit paid successfully', ...result });
    } catch (error) {
        console.error('Pay Admission Deposit Error:', error);
        const message = error instanceof Error ? error.message : 'Failed to pay admission deposit';
        res.status(error instanceof z.ZodError ? 400 : 409).json({ message });
    }
};

export const getBeds = async (req: AuthRequest, res: Response) => {
    try {
        const wards = await prisma.ward.findMany({
            include: {
                beds: {
                    include: {
                        currAdmission: {
                            where: { status: 'ADMITTED' },
                            include: {
                                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
                            }
                        }
                    },
                    orderBy: { number: 'asc' }
                }
            }
        });
        res.json(wards);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch beds' });
    }
};

export const admitPatient = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, wardId, bedId, reason } = admitSchema.parse(req.body);

        const paidDeposit = await prisma.invoice.findFirst({
            where: {
                patientId,
                admissionId: null,
                type: 'DEPOSIT',
                status: 'PAID',
                balance: 0,
                items: { array_contains: [{ bedId }] },
            },
            orderBy: { paymentConfirmedAt: 'desc' },
        });
        if (!paidDeposit) {
            return res.status(402).json({
                message: 'A fully paid admission deposit is required before assigning a bed.',
                requiresDeposit: true,
            });
        }

        // Find a vacant bed
        let bed;
        if (bedId) {
            bed = await prisma.bed.findUnique({
                where: { id: bedId }
            });
            if (!bed || bed.status !== 'VACANT_CLEAN') {
                return res.status(400).json({ message: 'Selected bed is not available' });
            }
        } else {
            bed = await prisma.bed.findFirst({
                where: { wardId, status: 'VACANT_CLEAN' }
            });
        }

        if (!bed) {
            return res.status(400).json({ message: 'No vacant clean beds available in this ward' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Atomically claim the bed: only succeeds if it is STILL vacant.
            // This prevents two concurrent admissions from grabbing the same bed
            // (the bed was selected outside the transaction).
            const claimed = await tx.bed.updateMany({
                where: { id: bed.id, status: 'VACANT_CLEAN' },
                data: { status: 'OCCUPIED' }
            });
            if (claimed.count === 0) {
                const err: any = new Error('That bed was just taken by another admission. Please select another bed.');
                err.statusCode = 409;
                throw err;
            }

            // 2. Create Admission Record
            const admission = await tx.admission.create({
                data: {
                    patientId,
                    bedId: bed.id,
                    admittedById: req.user!.id,
                    reason,
                    status: 'ADMITTED',
                    paymentStatus: 'CLEARED',
                    clearedAt: new Date(),
                }
            });

            const attached = await tx.invoice.updateMany({
                where: { id: paidDeposit.id, admissionId: null, status: 'PAID', balance: 0 },
                data: { admissionId: admission.id },
            });
            if (attached.count !== 1) {
                const err: any = new Error('The admission deposit has already been used');
                err.statusCode = 409;
                throw err;
            }

            // 3. Create Audit Log
            await tx.auditLog.create({
                data: {
                    userId: req.user!.id,
                    action: 'ADMIT_PATIENT',
                    entityType: 'Admission',
                    entityId: admission.id,
                    details: `Admitted patient to Bed ${bed.number}`
                }
            });

            return admission;
        });

        res.status(201).json(result);
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Admit Error:", error);
        res.status(500).json({ message: 'Failed to admit patient' });
    }
};

export const dischargePatient = async (req: AuthRequest, res: Response) => {
    try {
        const admissionId = req.params.id as string;

        const admission = await prisma.admission.findUnique({
            where: { id: admissionId },
            include: { bed: { include: { ward: true } } }
        });

        if (!admission || admission.status !== 'ADMITTED') {
            return res.status(404).json({ message: 'Active admission not found' });
        }

        let finalInvoice = await prisma.invoice.findFirst({
            where: { admissionId, type: 'FINAL_INPATIENT' },
            orderBy: { createdAt: 'desc' },
        });

        if (!finalInvoice) {
            const now = new Date();
            const elapsed = Math.max(now.getTime() - new Date(admission.admissionDate).getTime(), 0);
            const daysStayed = Math.max(1, Math.ceil(elapsed / (1000 * 60 * 60 * 24)));
            const ratePerDay = admission.bed.price ?? admission.bed.ward.basePrice;
            if (!ratePerDay || ratePerDay <= 0) return res.status(400).json({ message: 'Bed or ward price is not configured' });

            const deposits = await prisma.invoice.aggregate({
                where: { admissionId, type: 'DEPOSIT', status: 'PAID' },
                _sum: { amountPaid: true },
            });
            const grossTotal = daysStayed * ratePerDay;
            const depositCredit = Math.min(deposits._sum.amountPaid || 0, grossTotal);
            const finalBalance = Math.max(grossTotal - depositCredit, 0);

            finalInvoice = await prisma.invoice.create({
                data: {
                    invoiceNumber: generateInvoiceNumber('INV-IPD'),
                    patientId: admission.patientId,
                    admissionId,
                    type: 'FINAL_INPATIENT',
                    status: finalBalance === 0 ? 'PAID' : 'ISSUED',
                    items: [{ itemType: 'INPATIENT', itemId: admission.id, description: `Inpatient care (${daysStayed} day${daysStayed === 1 ? '' : 's'}) - ${admission.bed.ward.name}`, quantity: daysStayed, unitPrice: ratePerDay, total: grossTotal }],
                    subtotal: grossTotal,
                    discount: depositCredit,
                    tax: 0,
                    total: finalBalance,
                    balance: finalBalance,
                },
            });
        }

        if (finalInvoice.balance > 0) {
            await prisma.admission.update({ where: { id: admissionId }, data: { paymentStatus: 'AWAITING_PAYMENT', clearedAt: null, clearedById: null } });
            return res.status(402).json({
                message: `Final inpatient balance of ₦${finalInvoice.balance.toLocaleString()} must be paid before discharge.`,
                requiresFinalPayment: true,
                invoice: finalInvoice,
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const dischargeDate = new Date();
            
            // Final inpatient balance is settled; complete the clinical discharge.
            await tx.admission.update({
                where: { id: admissionId },
                data: {
                    status: 'DISCHARGED',
                    dischargeDate
                }
            });

            // 3. Free the Bed
            await tx.bed.update({
                where: { id: admission.bedId },
                data: { status: 'VACANT_DIRTY' } // Needs cleaning
            });

            return finalInvoice;
        });

        res.json({ message: 'Patient discharged after final payment clearance', invoice: result });

    } catch (error) {
        console.error("Discharge Error:", error);
        res.status(500).json({ message: 'Failed to discharge patient' });
    }
};

export const getWard = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const wardId = String(id);
        const ward = await prisma.ward.findUnique({
            where: { id: wardId },
            include: {
                beds: {
                    include: {
                        currAdmission: {
                            where: { status: 'ADMITTED' },
                            include: {
                                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
                            }
                        }
                    },
                    orderBy: { number: 'asc' }
                }
            }
        });

        if (!ward) return res.status(404).json({ message: 'Ward not found' });
        res.json(ward);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch ward' });
    }
};

export const updateBedStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const bedId = String(id);
        const { status } = req.body; // e.g., 'VACANT_CLEAN'

        const validStatuses = ['VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'MAINTENANCE'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid bed status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const existing = await prisma.bed.findUnique({ where: { id: bedId } });
        if (!existing) {
            return res.status(404).json({ message: 'Bed not found' });
        }

        const bed = await prisma.bed.update({
            where: { id: bedId },
            data: { status: status as any }
        });

        res.json({ message: 'Bed status updated', bed });
    } catch (error) {
        console.error('Update bed status error:', error);
        res.status(500).json({ message: 'Failed to update bed status' });
    }
};
