import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
                medicalRecord: {
                    include: {
                        doctor: {
                          include: { user: { select: { firstName: true, lastName: true } } }
                        }
                    }
                }
            },
            orderBy: {
                orderedAt: 'desc'
            }
        });
        res.json(pendingOrders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching lab requests', error });
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
        res.status(500).json({ message: 'Error updating lab status', error });
    }
};

export const uploadResult = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // labOrderId
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

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error uploading results', error });
    }
};
