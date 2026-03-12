import { Request, Response } from 'express';
import { PrismaClient, InvoiceStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';
import { randomBytes } from 'crypto';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

const admitSchema = z.object({
    patientId: z.string(),
    wardId: z.string(),
    bedId: z.string().optional(),
    reason: z.string(),
    estimatedDuration: z.number().optional(), // days
});

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
            // 1. Create Admission Record
            const admission = await tx.admission.create({
                data: {
                    patientId,
                    bedId: bed.id,
                    admittedById: req.user!.id,
                    reason,
                    status: 'ADMITTED'
                }
            });

            // 2. Update Bed Status
            await tx.bed.update({
                where: { id: bed.id },
                data: { status: 'OCCUPIED' }
            });

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
    } catch (error) {
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

        // Check for unpaid invoices before discharge
        const unpaidInvoices = await prisma.invoice.findMany({
            where: {
                patientId: admission.patientId,
                status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.DRAFT, InvoiceStatus.PARTIAL] }
            }
        });

        if (unpaidInvoices.length > 0) {
            const totalDue = unpaidInvoices.reduce((sum, inv) => sum + inv.balance, 0);
            return res.status(400).json({ 
                message: `Cannot discharge: Patient has ${unpaidInvoices.length} unpaid invoice(s) totaling ₦${totalDue.toLocaleString()}. Please settle all payments first.` 
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const dischargeDate = new Date();
            
            // 1. Calculate Duration & Cost using Ward's basePrice
            const diffTime = Math.abs(dischargeDate.getTime() - new Date(admission.admissionDate).getTime());
            const daysStayed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            // Use Bed's specific price if available, otherwise fallback to Ward's basePrice
            // Prices should be configured in Naira (₦) by admin
            const ratePerDay = admission.bed.price ?? admission.bed.ward.basePrice;
            
            if (!ratePerDay || ratePerDay <= 0) {
                throw new Error("Bed/Ward price not configured. Please contact admin to set up ward pricing.");
            }
            
            const totalCost = daysStayed * ratePerDay;

            // 2. Update Admission
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

            // 4. Generate Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNumber: generateInvoiceNumber('INV'),
                    patientId: admission.patientId,
                    status: 'ISSUED', // Ready for payment
                    items: [{
                        description: `Inpatient Care (${daysStayed} days) - ${admission.bed.ward.name}`,
                        quantity: daysStayed,
                        unitPrice: ratePerDay,
                        total: totalCost
                    }],
                    subtotal: totalCost,
                    tax: 0,
                    total: totalCost,
                    balance: totalCost
                }
            });

            return invoice;
        });

        res.json({ message: 'Patient discharged and invoice generated', invoice: result });

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

        await prisma.bed.update({
            where: { id: bedId },
            data: { status }
        });

        res.json({ message: 'Bed status updated' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update bed status' });
    }
};
