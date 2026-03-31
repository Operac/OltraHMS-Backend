import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createNotification } from './notification.controller';
import { sendToUser, sendToRole } from '../services/notification.service';
import { randomBytes } from 'crypto';
import { LAB_RANGES, isValueCritical, getCriticalFlag, getWarningFlag } from '../config/lab-ranges';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

export const getPendingOrders = async (req: Request, res: Response) => {
    try {
        const pendingOrders = await prisma.labOrder.findMany({
            where: {
                status: {
                    in: ['PENDING', 'IN_PROGRESS']
                }
            },
            include: {
                patient: {
                    select: {
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        bloodGroup: true,
                        genotype: true,
                    }
                },

                // Include invoice from Medical Record if linked, OR we need to find unlinked ones?
                // The issue is if we created an unlinked invoice, we can't easily find it via relation here unless we add a relation to LabOrder.
                // For now, let's rely on medicalRecord.invoice.
                medicalRecord: {
                    include: {
                        doctor: {
                          include: { user: { select: { firstName: true, lastName: true } } }
                        },
                        invoice: { select: { status: true, invoiceNumber: true, items: true } }
                    }
                }
            },
            orderBy: {
                orderedAt: 'desc'
            }
        });
        res.json(pendingOrders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching lab requests' });
    }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // IN_PROGRESS, etc

        const updatedOrder = await prisma.labOrder.update({
            where: { id: id as string },
            data: { status }
        });

        res.json(updatedOrder);
    } catch (error) {
        res.status(500).json({ message: 'Error updating lab status' });
    }
};

export const uploadResult = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // labOrderId
        
        // Get order first to verify patient
        const order = await prisma.labOrder.findUnique({
            where: { id: id as string },
            include: { patient: true, medicalRecord: { include: { invoice: true } } }
        });

        if (!order) return res.status(404).json({ message: 'Lab order not found' });

        // PRE-PAYMENT GATE: Verify payment cleared before releasing lab results
        // (unless STAT priority)
        if (order.priority !== 'STAT') {
            const unpaidInvoices = await prisma.invoice.findMany({
                where: { patientId: order.patientId, balance: { gt: 0 } },
                take: 1
            });
            if (unpaidInvoices.length > 0) {
                return res.status(402).json({
                    message: `Payment required before releasing lab results. Outstanding balance: ₦${unpaidInvoices[0].balance.toLocaleString()}`,
                    requiredPayment: unpaidInvoices[0].balance
                });
            }
        }
        
        // 0. Check Payment Gate (ServicePaymentStatus)
        if (!process.env.SKIP_INVOICE_CHECK) {
            const order = await prisma.labOrder.findUnique({
                where: { id: id as string },
                include: { medicalRecord: { include: { invoice: true } } }
            });

            if (order) {
                // STAT priority bypasses payment gate
                if (order.priority === 'STAT') {
                    // Auto-waive STAT orders
                    if (order.paymentStatus === 'AWAITING_PAYMENT') {
                        await prisma.labOrder.update({
                            where: { id: id as string },
                            data: {
                                paymentStatus: 'WAIVED',
                                clearedAt: new Date(),
                                waiverReason: 'STAT priority - emergency bypass'
                            }
                        });
                    }
                } else {
                    // For non-STAT orders, require CLEARED or WAIVED status
                    if (order.paymentStatus !== 'CLEARED' && order.paymentStatus !== 'WAIVED') {
                        // Also check if invoice is PAID (backward compat)
                        const linkedInvoice = order.medicalRecord?.invoice;
                        const isPaid = linkedInvoice?.status === 'PAID';

                        if (!isPaid) {
                            return res.status(402).json({
                                message: "Payment required before upload.",
                                paymentStatus: order.paymentStatus
                            });
                        }
                        // If invoice is paid, auto-clear the order
                        await prisma.labOrder.update({
                            where: { id: id as string },
                            data: {
                                paymentStatus: 'CLEARED',
                                clearedAt: new Date()
                            }
                        });
                    }
                }
            }
        }

        // Handle file upload if present
        const fileUrl = (req as any).file?.path;
        
        const { resultData, criticalFlags, aiInterpretation } = req.body;
        
        // Fetch staff profile for the current user
        const staff = await prisma.staff.findUnique({ 
            where: { userId: (req as any).user.id } 
        });
        
        if (!staff) {
            return res.status(403).json({ message: 'User is not authorized staff' });
        }

        const staffId = staff.id;

        // 1. Mark Order as COMPLETED
        await prisma.labOrder.update({
            where: { id: id as string },
            data: { 
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });
        
        // Parse resultData if stringified (common with multipart/form-data)
        let parsedResult = resultData;
        try {
            if (typeof resultData === 'string') parsedResult = JSON.parse(resultData);
        } catch(e) {}

        // Auto-generate critical flags based on lab ranges
        const autoCriticalFlags: string[] = [];
        const autoWarningFlags: string[] = [];
        
        if (parsedResult && typeof parsedResult === 'object') {
            for (const [testName, value] of Object.entries(parsedResult)) {
                // Skip non-numeric values
                if (typeof value === 'number' && !isNaN(value)) {
                    // Check for critical values
                    const criticalFlag = getCriticalFlag(testName, value);
                    if (criticalFlag) {
                        autoCriticalFlags.push(criticalFlag);
                    }
                    // Check for warning values (outside normal but not critical)
                    const warningFlag = getWarningFlag(testName, value);
                    if (warningFlag) {
                        autoWarningFlags.push(warningFlag);
                    }
                }
            }
        }

        // Merge auto-generated flags with manually provided flags
        const manualFlags = typeof criticalFlags === 'string' ? JSON.parse(criticalFlags) : criticalFlags;
        const combinedFlags = [...(Array.isArray(manualFlags) ? manualFlags : []), ...autoCriticalFlags];
        
        // If any critical flags are found (either manual or auto), notify the ordering doctor with HIGH priority
        const hasCriticalFlags = autoCriticalFlags.length > 0 || 
                               (Array.isArray(manualFlags) && manualFlags.some(flag => 
                                 typeof flag === 'string' && flag.includes('CRITICAL')));

        // 2. Create Result Entry
        const result = await prisma.labResult.create({
            data: {
                labOrderId: id as string,
                resultData: { ...parsedResult, documentUrl: fileUrl }, // Include file URL in JSON
                criticalFlags: combinedFlags,
                aiInterpretation,
                uploadedById: staffId
            }
        });
        
        // If there are critical flags, send a high-priority notification
        if (hasCriticalFlags) {
            const orderDetails = await prisma.labOrder.findUnique({
                 where: { id: id as string },
                 include: { 
                     medicalRecord: { 
                       select: { 
                         doctorId: true, 
                         patient: { select: { firstName: true, lastName: true } } 
                       } 
                     } 
                 }
            });
            
            if (orderDetails?.medicalRecord?.doctorId) {
                const doctor = await prisma.staff.findUnique({
                    where: { id: orderDetails.medicalRecord.doctorId },
                    select: { userId: true }
                });
                
                if (doctor) {
                    await createNotification(
                        doctor.userId,
                        `CRITICAL LAB RESULT: ${orderDetails.testName || 'Test'} for ${orderDetails.medicalRecord.patient.firstName} ${orderDetails.medicalRecord.patient.lastName} requires immediate attention`,
                        'HIGH',
                        'IN_APP'
                    );
                }
            }
        }

        // 3. Notify the ordering doctor
        const orderDetails = await prisma.labOrder.findUnique({
             where: { id: id as string },
             include: { 
                 medicalRecord: { select: { doctorId: true, patient: { select: { firstName: true, lastName: true } } } } 
             }
        });

        if (orderDetails?.medicalRecord?.doctorId) {
             const doctor = await prisma.staff.findUnique({
                 where: { id: orderDetails.medicalRecord.doctorId },
                 select: { userId: true }
             });

             if (doctor) {
                 await createNotification(
                     doctor.userId,
                     `Lab Result Ready: ${orderDetails.testName || 'Test'} for ${orderDetails.medicalRecord.patient.firstName} ${orderDetails.medicalRecord.patient.lastName}`,
                     'HIGH',
                     'IN_APP'
                 );
             }
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error uploading results' });
    }
};

export const createInvoice = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const DOCTOR_ORDER = await prisma.labOrder.findUnique({
            where: { id: id as string },
            include: { patient: true }
        });

        if (!DOCTOR_ORDER) return res.status(404).json({ message: 'Order not found' });

        // Fetch Service Price
        const service = await prisma.service.findUnique({
            where: { name: DOCTOR_ORDER.testName }
        });

        if (service?.isExternal) {
             return res.status(400).json({ message: 'External service: No invoice required.' });
        }

        if (!service) {
            return res.status(404).json({ message: `Service not found for test: ${DOCTOR_ORDER.testName}` });
        }
        const price = service.price;

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber('INV-LAB'),
                patientId: DOCTOR_ORDER.patientId,
                medicalRecordId: DOCTOR_ORDER.medicalRecordId, // Link to same visit
                status: 'ISSUED',
                items: [
                    {
                        itemType: 'LAB_TEST',
                        itemId: DOCTOR_ORDER.id,
                        name: DOCTOR_ORDER.testName,
                        quantity: 1,
                        unitPrice: price,
                        total: price
                    }
                ],
                subtotal: price,
                tax: 0,
                total: price,
                balance: price
            }
        });

        res.json(invoice);
    } catch (error) {
        
        console.error("Error creating invoice:", error);
        
        // Attempt to append if unique constraint failed
        if ((error as any).code === 'P2002') {
             try {
                const { id } = req.params;
                const existingOrder = await prisma.labOrder.findUnique({ where: { id: id as string } });
                if (!existingOrder) return res.status(404).json({ message: 'Order nout found' });

                // Fetch price again for retry scope
                const service = await prisma.service.findUnique({ where: { name: existingOrder.testName } });
                if (!service) throw new Error(`Service not found for: ${existingOrder.testName}`);
                const price = service.price;

                // Use findFirst for safer duplicate handling (medicalRecordId can be null)
                const existingInvoice = await prisma.invoice.findFirst({
                    where: { 
                        medicalRecordId: existingOrder.medicalRecordId,
                        patientId: existingOrder.patientId
                    }
                });

                if (existingInvoice) { 
                    
                     if (existingInvoice.status === 'PAID') {
                         const newInvoice = await prisma.invoice.create({
                            data: {
                                invoiceNumber: generateInvoiceNumber('INV-LAB'),
                                patientId: existingOrder.patientId,
                                medicalRecordId: null,  // Create separate invoice if original is paid
                                status: 'ISSUED',
                                items: [
                                    {
                                        itemType: 'LAB_TEST',
                                        itemId: existingOrder.id,
                                        name: existingOrder.testName,
                                        quantity: 1,
                                        unitPrice: price,
                                        total: price
                                    }
                                ],
                                subtotal: price,
                                tax: 0,
                                total: price,
                                balance: price
                            }
                        });
                        return res.json(newInvoice);
                    } else {
                        // Append
                        const currentItems = existingInvoice.items as any[];
                        // Check if item already exists
                        if (currentItems.find((i: any) => i.itemId === existingOrder.id)) {
                            return res.json(existingInvoice); // Already added
                        }

                        currentItems.push({
                            itemType: 'LAB_TEST',
                            itemId: existingOrder.id,
                            name: existingOrder.testName,
                            quantity: 1,
                            unitPrice: price,
                            total: price
                        });

                        const newTotal = existingInvoice.total + price;
                        const newBalance = existingInvoice.balance + price;

                        const updated = await prisma.invoice.update({
                            where: { id: existingInvoice.id },
                            data: {
                                items: currentItems,
                                subtotal: newTotal,
                                total: newTotal,
                                balance: newBalance
                            }
                        });
                        return res.json(updated);
                    }
                }
             } catch (retryError) {
                 return res.status(500).json({ message: 'Failed to append invoice', error: String(retryError) });
             }
        }

        res.status(500).json({ message: 'Error creating invoice', error: String(error) });
    }
};

/**
 * Patient submits payment for a lab order
 * Moves paymentStatus from AWAITING_PAYMENT to PAYMENT_SUBMITTED
 */
export const submitPayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // labOrderId
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const order = await prisma.labOrder.findUnique({
            where: { id: id as string },
            include: {
                patient: { select: { firstName: true, lastName: true } },
                medicalRecord: { select: { doctorId: true } }
            }
        });

        if (!order) return res.status(404).json({ message: 'Lab order not found' });

        if (order.paymentStatus !== 'AWAITING_PAYMENT') {
            return res.status(400).json({
                message: `Cannot submit payment. Current status: ${order.paymentStatus}`
            });
        }

        const updated = await prisma.labOrder.update({
            where: { id: id as string },
            data: { paymentStatus: 'PAYMENT_SUBMITTED' }
        });

        // Notify finance/accountant staff about payment submission
        const staffUsers = await prisma.staff.findMany({
            where: { user: { role: { in: ['ACCOUNTANT', 'ADMIN'] } } },
            select: { userId: true }
        });

        const notificationMessage = `Payment submitted for lab test "${order.testName}" - ${order.patient.firstName} ${order.patient.lastName}`;
        for (const staff of staffUsers) {
            await createNotification(staff.userId, notificationMessage, 'HIGH', 'IN_APP');
            sendToUser(staff.userId, {
                type: 'alert',
                title: 'Lab Payment Submitted',
                message: notificationMessage,
                data: { labOrderId: order.id, action: 'payment_submitted' }
            });
        }

        res.json({ message: 'Payment submitted. Awaiting confirmation.', order: updated });
    } catch (error) {
        console.error('Submit Payment Error:', error);
        res.status(500).json({ message: 'Failed to submit payment' });
    }
};

/**
 * Staff confirms payment clearance for a lab order
 * Moves paymentStatus to CLEARED
 */
export const clearPayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // labOrderId
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const order = await prisma.labOrder.findUnique({
            where: { id: id as string },
            include: {
                patient: { select: { firstName: true, lastName: true } },
                medicalRecord: {
                    include: { patient: { select: { userId: true, firstName: true, lastName: true } } }
                }
            }
        });

        if (!order) return res.status(404).json({ message: 'Lab order not found' });

        if (order.paymentStatus === 'CLEARED' || order.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: `Payment already ${order.paymentStatus.toLowerCase()}` });
        }

        const updated = await prisma.labOrder.update({
            where: { id: id as string },
            data: {
                paymentStatus: 'CLEARED',
                clearedAt: new Date(),
                clearedById: staff.id
            }
        });

        // Notify patient that payment is cleared
        if (order.medicalRecord?.patient?.userId) {
            const patientMessage = `Payment cleared for lab test "${order.testName}". You may proceed.`;
            await createNotification(order.medicalRecord.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(order.medicalRecord.patient.userId, {
                type: 'alert',
                title: 'Lab Payment Cleared',
                message: patientMessage,
                data: { labOrderId: order.id, action: 'payment_cleared' }
            });
        }

        res.json({ message: 'Payment cleared successfully', order: updated });
    } catch (error) {
        console.error('Clear Payment Error:', error);
        res.status(500).json({ message: 'Failed to clear payment' });
    }
};

/**
 * Admin waives payment for a lab order (emergency override)
 * Moves paymentStatus to WAIVED
 */
export const waivePayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // labOrderId
        const { waiverReason } = req.body;
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        // Only admin can waive
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admin can waive payments' });
        }

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const order = await prisma.labOrder.findUnique({
            where: { id: id as string },
            include: {
                patient: { select: { firstName: true, lastName: true } },
                medicalRecord: {
                    include: { patient: { select: { userId: true } } }
                }
            }
        });

        if (!order) return res.status(404).json({ message: 'Lab order not found' });

        if (order.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: 'Payment already waived' });
        }

        const updated = await prisma.labOrder.update({
            where: { id: id as string },
            data: {
                paymentStatus: 'WAIVED',
                clearedAt: new Date(),
                clearedById: staff.id,
                waiverReason: waiverReason || 'Emergency waiver'
            }
        });

        // Notify patient
        if (order.medicalRecord?.patient?.userId) {
            const patientMessage = `Payment waived for lab test "${order.testName}". Reason: ${waiverReason || 'Emergency'}`;
            await createNotification(order.medicalRecord.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(order.medicalRecord.patient.userId, {
                type: 'alert',
                title: 'Lab Payment Waived',
                message: patientMessage,
                data: { labOrderId: order.id, action: 'payment_waived' }
            });
        }

        res.json({ message: 'Payment waived successfully', order: updated });
    } catch (error) {
        console.error('Waive Payment Error:', error);
        res.status(500).json({ message: 'Failed to waive payment' });
    }
};
