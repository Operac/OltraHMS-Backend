import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { getDoctorDashboardStats } from '../controllers/doctor.controller';
import { getDiagnosisSuggestions } from '../services/ai.service';

const router = Router();

// GET /api/doctor/dashboard/stats - Get doctor's dashboard stats
router.get('/dashboard/stats', authenticate, getDoctorDashboardStats);

// GET /api/doctor/ai-status - Check if AI is available
router.get('/ai-status', authenticate, (_req: Request, res: Response) => {
    res.json({ available: !!process.env.MISTRAL_API_KEY });
});

// POST /api/doctor/ai-suggestions - Get real-time AI clinical suggestions
router.post('/ai-suggestions', authenticate, async (req: Request, res: Response) => {
    try {
        const { patientId, soap, vitals, history } = req.body;
        const patient = patientId ? await prisma.patient.findUnique({
            where: { id: patientId },
            select: { dateOfBirth: true, gender: true, allergies: true, chronicConditions: true }
        }) : null;

        const age = patient?.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : undefined;

        const suggestions = await getDiagnosisSuggestions({
            age,
            gender: patient?.gender,
            allergies: (patient?.allergies as string[]) || [],
            chronicConditions: (patient?.chronicConditions as string[]) || [],
            chiefComplaint: soap?.subjective,
            subjective: soap?.subjective,
            objective: soap?.objective,
            vitals: vitals ? {
                bpSystolic: vitals.bpSystolic ? Number(vitals.bpSystolic) : undefined,
                bpDiastolic: vitals.bpDiastolic ? Number(vitals.bpDiastolic) : undefined,
                heartRate: vitals.heartRate ? Number(vitals.heartRate) : undefined,
                temperature: vitals.temperature ? Number(vitals.temperature) : undefined,
                oxygenSaturation: vitals.oxygenSaturation ? Number(vitals.oxygenSaturation) : undefined,
            } : undefined,
        });

        if (!suggestions) {
            return res.status(503).json({ message: 'AI service not available' });
        }
        res.json(suggestions);
    } catch (error) {
        console.error('AI suggestions error:', error);
        res.status(500).json({ message: 'Failed to get AI suggestions' });
    }
});

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
      // Use hospital telemedicine settings as fallback
      const hospitalTelemedicineEnabled = settings?.telemedicineEnabled ?? true;
      const hospitalTelemedicine24Hours = settings?.telemedicine24Hours ?? true;
      const hospitalTelemedicineStart = settings?.telemedicineStart || '00:00';
      const hospitalTelemedicineEnd = settings?.telemedicineEnd || '23:59';
      
      filteredDoctors = doctors.filter((doctor: any) => {
        if (!doctor.telemedicineAvailable) return false;
        
        // If hospital is 24/7, allow all times
        if (hospitalTelemedicine24Hours) return true;
        
        // Use doctor's hours if set, otherwise fall back to hospital hours
        const startTime = doctor.telemedicineStartTime || hospitalTelemedicineStart;
        const endTime = doctor.telemedicineEndTime || hospitalTelemedicineEnd;
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
