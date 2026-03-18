import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';

// Validation schema for prescription availability check
const checkAvailabilitySchema = z.object({
    prescriptionIds: z.array(z.string().uuid({ message: 'Invalid prescription ID' })).min(1, { message: 'At least one prescription ID required' }).max(50, { message: 'Maximum 50 prescriptions allowed' })
});

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

/**
 * Get availability status for multiple prescriptions
 * Helps pharmacy see what can be dispensed vs what needs external pharmacy
 */
export const checkPrescriptionAvailability = async (req: AuthRequest, res: Response) => {
    try {
        // Validate input with Zod
        const { prescriptionIds } = checkAvailabilitySchema.parse(req.body);
        
        const results = await Promise.all(prescriptionIds.map(async (prescriptionId: string) => {
            const prescription = await prisma.prescription.findUnique({
                where: { id: prescriptionId },
                include: { patient: true }
            });

            if (!prescription) {
                return { prescriptionId, status: 'NOT_FOUND', message: 'Prescription not found' };
            }

            // Check if medication exists in catalog
            const medication = await prisma.medication.findFirst({
                where: { name: { equals: prescription.medicationName, mode: 'insensitive' } }
            });

            if (!medication) {
                return { 
                    prescriptionId, 
                    status: 'EXTERNAL', 
                    medicationName: prescription.medicationName,
                    message: 'Not in hospital catalog - get from external pharmacy'
                };
            }

            // Check stock
            const batches = await prisma.inventoryBatch.findMany({
                where: { medicationId: medication.id, quantity: { gt: 0 } }
            });

            const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);
            
            if (totalStock === 0) {
                return { 
                    prescriptionId, 
                    status: 'OUT_OF_STOCK', 
                    medicationName: prescription.medicationName,
                    message: 'Out of stock - get from external pharmacy'
                };
            }

            // Check if prescribed quantity is available
            const available = totalStock >= prescription.quantity;
            return { 
                prescriptionId, 
                status: available ? 'AVAILABLE' : 'PARTIAL',
                medicationName: prescription.medicationName,
                requestedQuantity: prescription.quantity,
                availableQuantity: totalStock,
                message: available ? 'Can dispense full amount' : `Only ${totalStock} available - rest from external pharmacy`
            };
        }));

        res.json(results);
    } catch (error) {
        res.status(500).json({ message: 'Failed to check availability' });
    }
};

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

        // Check if prescription has expired
        if (prescription.expiryDate && new Date() > prescription.expiryDate) {
            return res.status(400).json({ 
                message: 'Prescription has expired. Please consult your doctor for a new prescription.' 
            });
        }

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
        // Check for existing unpaid invoice for this medical record/prescription
        const existingInvoice = await prisma.invoice.findFirst({
            where: {
                patientId: prescription.patientId,
                status: { in: ['ISSUED', 'PARTIAL'] },
                OR: [
                    { medicalRecordId: prescription.medicalRecordId },
                ].filter(Boolean)
            },
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        // Check if medication is available in inventory before proceeding
        const medicationExists = await prisma.medication.findFirst({
            where: { name: { equals: prescription.medicationName, mode: 'insensitive' } }
        });
        
        if (!medicationExists) {
            // Medication not in hospital system - mark for external pharmacy
            return res.status(200).json({ 
                message: `Medication '${prescription.medicationName}' is not available in hospital pharmacy.`,
                requiresExternal: true,
                medicationName: prescription.medicationName,
                dispensed: false
            });
        }

        // Check total stock across all batches
        const inventoryBatches = await prisma.inventoryBatch.findMany({
            where: { medicationId: medicationExists.id, quantity: { gt: 0 } }
        });
        
        const totalStock = inventoryBatches.reduce((sum, batch) => sum + batch.quantity, 0);
        if (totalStock === 0) {
            // Out of stock - mark for external pharmacy
            return res.status(200).json({ 
                message: `Medication '${prescription.medicationName}' is out of stock.`,
                requiresExternal: true,
                medicationName: prescription.medicationName,
                dispensed: false
            });
        }

        // Payment verification (unless SKIP_INVOICE_CHECK is enabled for testing)
        if (process.env.SKIP_INVOICE_CHECK !== 'true') {
            // Check if there's an existing unpaid invoice OR a paid invoice for this encounter
            const hasValidInvoice = existingInvoice || await prisma.invoice.findFirst({
                where: {
                    patientId: prescription.patientId,
                    status: 'PAID',
                    medicalRecordId: prescription.medicalRecordId
                }
            });
            
            if (!hasValidInvoice) {
                return res.status(402).json({ 
                    message: "Payment required before dispensing. No valid invoice found.",
                    requiresPayment: true
                });
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            let totalCost = 0;
            const invoiceItems: Array<{
                description: string;
                quantity: number;
                unitPrice: number;
                total: number;
            }> = [];

            for (const item of items) {
                const { batchId, quantity, medicationId } = item;

                // 1. Get Batch & Med details - Apply FEFO (First Expired First Out)
                let batch;
                if (batchId) {
                    // If specific batch provided, use it
                    batch = await tx.inventoryBatch.findUnique({
                        where: { id: batchId },
                        include: { medication: true }
                    });
                } else {
                    // If no batch specified, auto-select the earliest expiring batch (FEFO)
                    batch = await tx.inventoryBatch.findFirst({
                        where: { 
                            medicationId: medicationId,
                            quantity: { gte: quantity }
                        },
                        orderBy: { expiryDate: 'asc' },
                        include: { medication: true }
                    });
                    if (!batch) {
                        throw new Error(`Insufficient stock for medication ${medicationId}`);
                    }
                }

                if (!batch) throw new Error(`Batch ${batchId} not found`);
                if (batch.quantity < quantity) throw new Error(`Insufficient stock in Batch ${batch.batchNumber}`);

                // 2. Deduct Stock with optimistic locking (conditional update)
                // This prevents race conditions by ensuring quantity is still sufficient
                const batchToUpdateId = batchId || batch.id;
                const updatedBatch = await tx.inventoryBatch.updateMany({
                    where: { 
                        id: batchToUpdateId,
                        quantity: { gte: quantity } // Only update if sufficient quantity available
                    },
                    data: { quantity: { decrement: quantity } }
                });

                // Check if update was successful (row count = 0 means concurrent modification)
                if (updatedBatch.count === 0) {
                    throw new Error(`Concurrent modification detected for batch ${batch.batchNumber}. Please retry.`);
                }

                // 3. Record Dispensing (1 Prescription = 1 Medication)
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

            // 5. Generate Invoice or Update Existing
            let invoice;
            if (existingInvoice) {
                // Append items to existing unpaid invoice
                const currentItems = existingInvoice.items as any[];
                currentItems.push(...invoiceItems);
                
                const newTotal = existingInvoice.total + totalCost;
                const newBalance = existingInvoice.balance + totalCost;

                invoice = await tx.invoice.update({
                    where: { id: existingInvoice.id },
                    data: {
                        items: currentItems,
                        subtotal: newTotal,
                        total: newTotal,
                        balance: newBalance
                    }
                });
            } else {
                // Create new invoice only if no existing unpaid invoice
                invoice = await tx.invoice.create({
                    data: {
                        invoiceNumber: generateInvoiceNumber('INV'),
                        patientId: prescription.patientId,
                        medicalRecordId: prescription.medicalRecordId,
                        items: invoiceItems,
                        subtotal: totalCost,
                        tax: 0,
                        total: totalCost,
                        balance: totalCost,
                        status: 'ISSUED'
                    }
                });
            }

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
                invoiceNumber: generateInvoiceNumber('INV-RX'),
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
