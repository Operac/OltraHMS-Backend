import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { createNotification } from './notification.controller';
import { sendToUser } from '../services/notification.service';

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

        // PRE-PAYMENT GATE: Verify payment cleared before dispensing ANY medication
        const patientUnpaid = await prisma.invoice.findMany({
            where: { patientId: prescription.patientId, balance: { gt: 0 } },
            take: 1
        });
        if (patientUnpaid.length > 0) {
            return res.status(402).json({
                message: `Payment required before dispensing. Outstanding balance: ₦${patientUnpaid[0].balance.toLocaleString()}`,
                requiredPayment: patientUnpaid[0].balance
            });
        }

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
// Check for existing invoice for this medical record/prescription (any status)
const existingInvoice = await prisma.invoice.findFirst({
    where: {
        patientId: prescription.patientId,
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

        // Payment verification - ALWAYS enforced for production integrity
        // Check ServicePaymentStatus on the prescription
        if (prescription.paymentStatus !== 'CLEARED' && prescription.paymentStatus !== 'WAIVED') {
            // Also check if there's a PAID invoice (backward compat)
            const hasPaidInvoice = await prisma.invoice.findFirst({
                where: {
                    patientId: prescription.patientId,
                    status: 'PAID',
                    medicalRecordId: prescription.medicalRecordId
                }
            });

            if (!hasPaidInvoice) {
                return res.status(402).json({
                    message: "Payment required before dispensing. Payment must be cleared.",
                    requiresPayment: true,
                    paymentStatus: prescription.paymentStatus
                });
            }

            // Auto-clear if invoice is PAID
            await prisma.prescription.update({
                where: { id: prescriptionId },
                data: { paymentStatus: 'CLEARED', clearedAt: new Date() }
            });
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
                 // Append items to existing invoice (any status)
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
                 // Create new invoice only if no existing invoice
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

/**
 * Get prescriptions with refill requests
 * Returns prescriptions that have been requested for refill
 */
export const getRefillRequests = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptions = await prisma.prescription.findMany({
            where: {
                status: 'REFILL_REQUESTED'
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        phone: true
                    }
                },
                medicalRecord: {
                    include: {
                        doctor: {
                            include: { user: { select: { firstName: true, lastName: true } } }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(prescriptions);
    } catch (error) {
        console.error("Get Refill Requests Error:", error);
        res.status(500).json({ message: 'Failed to fetch refill requests' });
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

        // Check for active insurance
        const activeInsurance = await prisma.patientInsurance.findFirst({
            where: {
                patientId: prescription.patientId,
                status: { in: ['ACTIVE', 'VERIFIED'] },
                OR: [
                    { validUntil: { gte: new Date() } },
                    { validUntil: null }
                ],
                isPrimary: true
            }
        });

        let insuranceCoveredAmount = 0;
        let patientResponsibility = totalLinePrice;
        let patientInsuranceId: string | undefined;

        if (activeInsurance) {
            const coveragePercent = activeInsurance.coveragePercentage / 100;
            insuranceCoveredAmount = Math.round(totalLinePrice * coveragePercent * 100) / 100;
            patientResponsibility = totalLinePrice - insuranceCoveredAmount;
            patientInsuranceId = activeInsurance.id;
        }

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber('INV-RX'),
                patientId: prescription.patientId,
                medicalRecordId: prescription.medicalRecordId,
                prescriptionId: prescriptionId,
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
                balance: patientResponsibility,
                insuranceCoveredAmount,
                patientResponsibility,
                patientInsuranceId
            }
        });

        res.status(201).json(invoice);
    } catch (error) {
        console.error("Create Invoice Error:", error);
        res.status(500).json({ message: 'Failed to create invoice' });
    }
};

/**
 * Patient submits payment for a prescription
 * Moves paymentStatus from AWAITING_PAYMENT to PAYMENT_SUBMITTED
 */
export const submitPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { prescriptionId } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: {
                patient: { select: { firstName: true, lastName: true } }
            }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        if (prescription.paymentStatus !== 'AWAITING_PAYMENT') {
            return res.status(400).json({
                message: `Cannot submit payment. Current status: ${prescription.paymentStatus}`
            });
        }

        const updated = await prisma.prescription.update({
            where: { id: prescriptionId },
            data: { paymentStatus: 'PAYMENT_SUBMITTED' }
        });

        // Notify finance/accountant staff
        const staffUsers = await prisma.staff.findMany({
            where: { user: { role: { in: ['ACCOUNTANT', 'ADMIN'] } } },
            select: { userId: true }
        });

        const notificationMessage = `Payment submitted for prescription "${prescription.medicationName}" - ${prescription.patient.firstName} ${prescription.patient.lastName}`;
        for (const staff of staffUsers) {
            await createNotification(staff.userId, notificationMessage, 'HIGH', 'IN_APP');
            sendToUser(staff.userId, {
                type: 'alert',
                title: 'Pharmacy Payment Submitted',
                message: notificationMessage,
                data: { prescriptionId: prescription.id, action: 'payment_submitted' }
            });
        }

        res.json({ message: 'Payment submitted. Awaiting confirmation.', prescription: updated });
    } catch (error) {
        console.error('Submit Payment Error:', error);
        res.status(500).json({ message: 'Failed to submit payment' });
    }
};

/**
 * Staff confirms payment clearance for a prescription
 * Moves paymentStatus to CLEARED
 */
export const clearPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { prescriptionId } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: {
                medicalRecord: {
                    include: { patient: { select: { userId: true, firstName: true, lastName: true } } }
                }
            }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        if (prescription.paymentStatus === 'CLEARED' || prescription.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: `Payment already ${prescription.paymentStatus.toLowerCase()}` });
        }

        const updated = await prisma.prescription.update({
            where: { id: prescriptionId },
            data: {
                paymentStatus: 'CLEARED',
                clearedAt: new Date(),
                clearedById: staff.id
            }
        });

        // Notify patient
        if (prescription.medicalRecord?.patient?.userId) {
            const patientMessage = `Payment cleared for prescription "${prescription.medicationName}". Ready for dispensing.`;
            await createNotification(prescription.medicalRecord.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(prescription.medicalRecord.patient.userId, {
                type: 'alert',
                title: 'Pharmacy Payment Cleared',
                message: patientMessage,
                data: { prescriptionId: prescription.id, action: 'payment_cleared' }
            });
        }

        res.json({ message: 'Payment cleared successfully', prescription: updated });
    } catch (error) {
        console.error('Clear Payment Error:', error);
        res.status(500).json({ message: 'Failed to clear payment' });
    }
};

/**
 * Admin waives payment for a prescription (emergency override)
 * Moves paymentStatus to WAIVED
 */
export const waivePayment = async (req: AuthRequest, res: Response) => {
    try {
        const { prescriptionId, waiverReason } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admin can waive payments' });
        }

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: {
                medicalRecord: {
                    include: { patient: { select: { userId: true, firstName: true, lastName: true } } }
                }
            }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        if (prescription.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: 'Payment already waived' });
        }

        const updated = await prisma.prescription.update({
            where: { id: prescriptionId },
            data: {
                paymentStatus: 'WAIVED',
                clearedAt: new Date(),
                clearedById: staff.id,
                waiverReason: waiverReason || 'Emergency waiver'
            }
        });

        // Notify patient
        if (prescription.medicalRecord?.patient?.userId) {
            const patientMessage = `Payment waived for prescription "${prescription.medicationName}". Reason: ${waiverReason || 'Emergency'}`;
            await createNotification(prescription.medicalRecord.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(prescription.medicalRecord.patient.userId, {
                type: 'alert',
                title: 'Pharmacy Payment Waived',
                message: patientMessage,
                data: { prescriptionId: prescription.id, action: 'payment_waived' }
            });
        }

        res.json({ message: 'Payment waived successfully', prescription: updated });
    } catch (error) {
        console.error('Waive Payment Error:', error);
        res.status(500).json({ message: 'Failed to waive payment' });
    }
};
