import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get prescriptions that are ready to be dispensed
 */
export const getPendingPrescriptions = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptions = await prisma.prescription.findMany({
            where: {
                status: { in: ['PENDING', 'REFILL_REQUESTED'] }
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true
                    }
                },
                medicalRecord: {
                    include: {
                        doctor: {
                            include: { user: { select: { lastName: true } } }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json(prescriptions);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch queue' });
    }
};

/**
 * Dispense Medication
 * 1. Validates Stock in selected batches
 * 2. Deducts Stock
 * 3. Updates Prescription Status
 * 4. Generates Invoice
 */
export const dispenseMedication = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptionId = String(req.params.prescriptionId);
        const { items } = req.body; // Array of { medicationId, batchId, quantity }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'No items selected for dispensing' });
        }

        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: { patient: true }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        // Get Staff ID
        const userWithStaff = await prisma.user.findUnique({
            where: { id: req.user?.id },
            include: { staff: true }
        });

        if (!userWithStaff || !userWithStaff.staff) {
            return res.status(403).json({ message: 'Only staff can dispense medication' });
        }
        const staffId = userWithStaff.staff.id;

        // Start Transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
            let totalCost = 0;
            const invoiceItems = [];

            for (const item of items) {
                const { batchId, quantity, medicationId } = item;

                // 1. Get Batch & Med details
                const batch = await tx.inventoryBatch.findUnique({
                    where: { id: batchId },
                    include: { medication: true }
                });

                if (!batch) throw new Error(`Batch ${batchId} not found`);
                if (batch.quantity < quantity) throw new Error(`Insufficient stock in Batch ${batch.batchNumber}`);

                // 2. Deduct Stock
                await tx.inventoryBatch.update({
                    where: { id: batchId },
                    data: { quantity: batch.quantity - quantity }
                });

                // 3. Record Dispensing
                // Note: Schema has 1-to-1 dispensing-prescription, but we might have multiple items if prescription has multiple meds?
                // Actually existing schema `Dispensing` is 1-to-1 with `Prescription`. 
                // The current schema assumes 1 Prescription = 1 Med. 
                // If Frontend makes multiple calls/loop, that works. Or if Prescription is 1 line item.
                // Assuming 1 Prescription Record = 1 Drug.
                
                await tx.dispensing.create({
                    data: {
                        prescriptionId: prescriptionId,
                        medicationId: medicationId,
                        batchNumber: batch.batchNumber,
                        quantity: quantity,
                        dispensedById: staffId
                    }
                });

                // Calculation for Invoice
                const itemTotal = batch.medication.price * quantity;
                totalCost += itemTotal;
                invoiceItems.push({
                    description: `${batch.medication.name} (${quantity} units)`,
                    quantity,
                    unitPrice: batch.medication.price,
                    total: itemTotal
                });
            }

            // 4. Update Prescription Status
            await tx.prescription.update({
                where: { id: prescriptionId },
                data: { status: 'DISPENSED' }
            });

            // 5. Generate Invoice
            // Check if open invoice exists? For simplicity, create new one for this transaction.
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNumber: `INV-${Date.now()}`,
                    patientId: prescription.patientId,
                    medicalRecordId: prescription.medicalRecordId, // Link to visit
                    items: invoiceItems,
                    subtotal: totalCost,
                    tax: 0, // Simplified
                    total: totalCost,
                    balance: totalCost,
                    status: 'ISSUED'
                }
            });

            return { invoice, prescriptionId };
        });

        res.json({ message: 'Dispensing successful', ...result });

    } catch (error: any) {
        console.error("Dispense Error:", error);
        res.status(400).json({ message: error.message || 'Dispensing failed' });
    }
};
