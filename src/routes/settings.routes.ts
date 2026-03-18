import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/settings/hospital - Get hospital settings
router.get('/hospital', async (req: Request, res: Response) => {
  try {
    let settings = await prisma.hospitalSettings.findFirst();
    
    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.hospitalSettings.create({
        data: {}
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching hospital settings:', error);
    res.status(500).json({ message: 'Failed to fetch hospital settings' });
  }
});

// PUT /api/settings/hospital - Update hospital settings (Admin only)
router.put('/hospital', async (req: Request, res: Response) => {
  try {
    const {
      currencyCode,
      currencySymbol,
      mondayOpen, mondayClose,
      tuesdayOpen, tuesdayClose,
      wednesdayOpen, wednesdayClose,
      thursdayOpen, thursdayClose,
      fridayOpen, fridayClose,
      saturdayOpen, saturdayClose,
      sundayOpen, sundayClose,
      telemedicineEnabled,
      telemedicineStart,
      telemedicineEnd
    } = req.body;

    let settings = await prisma.hospitalSettings.findFirst();
    
    if (settings) {
      settings = await prisma.hospitalSettings.update({
        where: { id: settings.id },
        data: {
          currencyCode,
          currencySymbol,
          mondayOpen, mondayClose,
          tuesdayOpen, tuesdayClose,
          wednesdayOpen, wednesdayClose,
          thursdayOpen, thursdayClose,
          fridayOpen, fridayClose,
          saturdayOpen, saturdayClose,
          sundayOpen, sundayClose,
          telemedicineEnabled,
          telemedicineStart,
          telemedicineEnd
        }
      });
    } else {
      settings = await prisma.hospitalSettings.create({
        data: {
          currencyCode,
          currencySymbol,
          mondayOpen, mondayClose,
          tuesdayOpen, tuesdayClose,
          wednesdayOpen, wednesdayClose,
          thursdayOpen, thursdayClose,
          fridayOpen, fridayClose,
          saturdayOpen, saturdayClose,
          sundayOpen, sundayClose,
          telemedicineEnabled,
          telemedicineStart,
          telemedicineEnd
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating hospital settings:', error);
    res.status(500).json({ message: 'Failed to update hospital settings' });
  }
});

export default router;
