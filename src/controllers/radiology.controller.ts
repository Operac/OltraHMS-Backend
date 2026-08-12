
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import cloudinary from '../config/cloudinary';

/**
 * Helper to get staff ID from user ID
 */
const getStaffId = async (userId: string): Promise<string | null> => {
    const staff = await prisma.staff.findUnique({
        where: { userId },
        select: { id: true }
    });
    return staff?.id || null;
};

/**
 * Get all available radiology tests
 */
export const getTests = async (req: AuthRequest, res: Response) => {
    try {
        const tests = await prisma.radiologyTest.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(tests);
    } catch (error) {
        console.error('Error fetching radiology tests:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Doctor creates a radiology request
 */
export const createRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, testId, priority, notes } = req.body;
        
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
        const doctorId = await getStaffId(req.user.id);

        if (!doctorId) {
            return res.status(403).json({ message: 'Only staff can create requests' });
        }

        const request = await prisma.radiologyRequest.create({
            data: {
                patientId,
                testId,
                doctorId,
                priority: priority || 'ROUTINE',
                notes,
                status: 'PENDING'
            },
            include: {
                test: true,
                patient: {
                    select: { firstName: true, lastName: true, patientNumber: true }
                }
            }
        });

        res.status(201).json(request);
    } catch (error) {
        console.error('Error creating radiology request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Get radiology requests (Worklist)
 * Filters: status, patientId
 */
export const getRequests = async (req: AuthRequest, res: Response) => {
    try {
        const { status, patientId } = req.query;
        
        const where: any = {};
        if (status) where.status = String(status);
        if (patientId) where.patientId = String(patientId);

        const requests = await prisma.radiologyRequest.findMany({
            where,
            include: {
                patient: {
                    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, gender: true }
                },
                test: true,
                doctor: {
                    select: { 
                        user: { select: { firstName: true, lastName: true } }
                    }
                },
                report: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Flatten doctor name for frontend convenience if needed, or frontend handles nested
        const formattedRequests = requests.map(req => ({
            ...req,
            doctorName: req.doctor?.user ? `${req.doctor.user.firstName} ${req.doctor.user.lastName}` : 'Unknown'
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error('Error fetching radiology requests:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Radiologist submits a report with images
 */
export const addReport = async (req: AuthRequest, res: Response) => {
    try {
        const requestId = String(req.params.requestId);
        const { findings, impression } = req.body;
        
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
        const radiologistId = await getStaffId(req.user.id);
        
        const files = req.files as Express.Multer.File[];

        if (!radiologistId) {
            return res.status(403).json({ message: 'Only staff can submit reports' });
        }

        // Upload middleware has already stored each image and populated its URL.
        const imageUrls = files ? files.map(file => file.path) : [];

        // 2. Create Report
        const report = await prisma.radiologyReport.create({
            data: {
                requestId,
                radiologistId,
                findings,
                impression,
                imageUrls
            }
        });

        // 3. Update Request Status
        await prisma.radiologyRequest.update({
            where: { id: requestId },
            data: { status: 'COMPLETED' }
        });

        res.status(201).json(report);
    } catch (error) {
        console.error('Error adding radiology report:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
