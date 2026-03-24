import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createNotification } from './notification.controller';
import { randomBytes } from 'crypto';

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
        
        // 0. Check Payment (Strict Mode)
        if (!process.env.SKIP_INVOICE_CHECK) {
            const order = await prisma.labOrder.findUnique({
                where: { id: id as string },
                include: { medicalRecord: { include: { invoice: true } } }
            });

            if (order) {
                // Check linked invoice
                const linkedInvoice = order.medicalRecord?.invoice;
                let isPaid = false;

                if (linkedInvoice) {
                      if (linkedInvoice.status === 'PAID') isPaid = true;
                }

                // Also check if there's an unlinked invoice for this patient/labOrder?
                // Too complex for now. We rely on the append logic.
                
                // If not paid, check if there's a specific "Lab Invoice" that is paid?
                // For now, if no invoice exists or not paid, block.
                // UNLESS it's emergency?
                
                if (!isPaid && order.priority !== 'STAT') {
                     return res.status(402).json({ message: "Payment required before upload." });
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

        // 2. Create Result Entry
        const result = await prisma.labResult.create({
            data: {
                labOrderId: id as string,
                resultData: { ...parsedResult, documentUrl: fileUrl }, // Include file URL in JSON
                criticalFlags: typeof criticalFlags === 'string' ? JSON.parse(criticalFlags) : criticalFlags,
                aiInterpretation,
                uploadedById: staffId
            }
        });

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

                const existingInvoice = await prisma.invoice.findUnique({
                    where: { medicalRecordId: existingOrder.medicalRecordId }
                });

                if (existingInvoice) { 
                    
                     if (existingInvoice.status === 'PAID') {
                         const newInvoice = await prisma.invoice.create({
                            data: {
                                invoiceNumber: generateInvoiceNumber('INV-LAB'),
                                patientId: existingOrder.patientId,
                                // medicalRecordId: null, // Don't link if one exists
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
