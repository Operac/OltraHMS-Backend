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
                        },
                        invoice: {
                            select: { status: true, invoiceNumber: true }
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
        // Check validation
        if (!process.env.SKIP_INVOICE_CHECK) {
            // Check if there is a PAID invoice linked to this prescription/medicalRecord
            // This logic assumes 1 invoice per prescription or medical record context
            const invoice = await prisma.invoice.findFirst({
                where: { 
                    OR: [
                        { medicalRecordId: prescription.medicalRecordId },
                        // In future, link invoice directly to prescription items if needed
                    ],
                    status: 'PAID'
                }
            });

            // NOTE: For now we warn or block based on config. 
            // In strict mode, uncomment:
            // if (!invoice) return res.status(402).json({ message: "Payment required before dispensing." });
        }

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

/**
 * Get Dispensing Report
 * Returns stats (Day/Week/Month) and recent history
 */
export const getDispensingReport = async (req: AuthRequest, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);

        const monthStart = new Date(today);
        monthStart.setMonth(today.getMonth() - 1);

        // Run queries in parallel
        const [todayCount, weekCount, monthCount, history] = await Promise.all([
            prisma.dispensing.count({
                where: { dispensedAt: { gte: today } }
            }),
            prisma.dispensing.count({
                where: { dispensedAt: { gte: weekStart } }
            }),
            prisma.dispensing.count({
                where: { dispensedAt: { gte: monthStart } }
            }),
            prisma.dispensing.findMany({
                take: 50,
                orderBy: { dispensedAt: 'desc' },
                include: {
                    medication: { select: { name: true, category: true } },
                    dispensedBy: { 
                        include: { user: { select: { firstName: true, lastName: true } } } 
                    },
                    prescription: {
                        include: {
                            patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                            medicalRecord: {
                                include: {
                                    doctor: {
                                        include: {
                                            user: { select: { lastName: true } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })
        ]);

        res.json({
            stats: {
                today: todayCount,
                week: weekCount,
                month: monthCount
            },
            history
        });

    } catch (error) {
        console.error("Report Error:", error);
        res.status(500).json({ message: 'Failed to fetch report' });
    }
};

export const createInvoice = async (req: AuthRequest, res: Response) => {
    try {
        const { prescriptionId } = req.body;
        
        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: { medicalRecord: true }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        const medication = await prisma.medication.findFirst({ where: { name: prescription.medicationName } });
        if (!medication) return res.status(404).json({ message: 'Medication not found in the catalog to determine price.' });
        
        const unitPrice = medication.price;
        const totalLinePrice = prescription.quantity * unitPrice;

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: `INV-RX-${Date.now()}`,
                patientId: prescription.patientId,
                medicalRecordId: prescription.medicalRecordId,
                status: 'ISSUED',
                items: [
                    {
                        description: `Medication: ${prescription.medicationName} (${prescription.quantity})`,
                        quantity: prescription.quantity,
                        unitPrice: unitPrice,
                        total: totalLinePrice
                    }
                ],
                subtotal: totalLinePrice,
                tax: 0,
                total: totalLinePrice,
                balance: totalLinePrice
            }
        });

        res.status(201).json(invoice);
    } catch (error) {
        console.error("Create Invoice Error:", error);
        res.status(500).json({ message: 'Failed to create invoice' });
    }
};
