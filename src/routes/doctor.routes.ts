import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import { getDoctorDashboardStats } from '../controllers/doctor.controller';

const router = Router();
const prisma = new PrismaClient();

// GET /api/doctor/dashboard/stats - Get doctor's dashboard stats
router.get('/dashboard/stats', authenticate, getDoctorDashboardStats);

// PUT /api/doctor/telemedicine - Update doctor's telemedicine availability
router.put('/telemedicine', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { telemedicineAvailable, telemedicineStartTime, telemedicineEndTime } = req.body;

    const staff = await prisma.staff.findUnique({
      where: { userId }
    });

    if (!staff) {
      return res.status(404).json({ message: 'Staff record not found' });
    }

    const updatedStaff = await prisma.staff.update({
      where: { id: staff.id },
      data: {
        telemedicineAvailable,
        telemedicineStartTime,
        telemedicineEndTime
      }
    });

    res.json(updatedStaff);
  } catch (error) {
    console.error('Error updating telemedicine availability:', error);
    res.status(500).json({ message: 'Failed to update telemedicine availability' });
  }
});

// GET /api/doctor/telemedicine - Get doctor's telemedicine availability
router.get('/telemedicine', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const staff = await prisma.staff.findUnique({
      where: { userId }
    });

    if (!staff) {
      return res.status(404).json({ message: 'Staff record not found' });
    }

    res.json({
      telemedicineAvailable: staff.telemedicineAvailable,
      telemedicineStartTime: staff.telemedicineStartTime,
      telemedicineEndTime: staff.telemedicineEndTime
    });
  } catch (error) {
    console.error('Error fetching telemedicine availability:', error);
    res.status(500).json({ message: 'Failed to fetch telemedicine availability' });
  }
});

// GET /api/doctors/available - Get available doctors for telemedicine (for patients)
router.get('/available', async (req: Request, res: Response) => {
  try {
    const { type } = req.query; // 'TELEHEALTH' or 'IN_PERSON'

    // Get hospital settings
    const settings = await prisma.hospitalSettings.findFirst();
    const telemedicineEnabled = settings?.telemedicineEnabled ?? true;
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:mm format

    // If requesting telemedicine and it's disabled, return empty
    if (type === 'TELEHEALTH' && !telemedicineEnabled) {
      return res.json([]);
    }

    // Build the query
    const whereClause: any = {
      user: {
        role: 'DOCTOR'
      },
      employmentStatus: 'ACTIVE',
      isDeleted: false
    };

    // If TELEHEALTH, only show doctors who have enabled telemedicine and are within their hours
    if (type === 'TELEHEALTH') {
      whereClause.telemedicineAvailable = true;
    }

    const doctors = await prisma.staff.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        department: true
      }
    });

    // Filter doctors based on their telemedicine hours if applicable
    let filteredDoctors = doctors;
    if (type === 'TELEHEALTH') {
      filteredDoctors = doctors.filter((doctor: any) => {
        if (!doctor.telemedicineAvailable) return false;
        const startTime = doctor.telemedicineStartTime || '09:00';
        const endTime = doctor.telemedicineEndTime || '17:00';
        return currentTime >= startTime && currentTime <= endTime;
      });
    }

    res.json(filteredDoctors);
  } catch (error) {
    console.error('Error fetching available doctors:', error);
    res.status(500).json({ message: 'Failed to fetch available doctors' });
  }
});

export default router;
