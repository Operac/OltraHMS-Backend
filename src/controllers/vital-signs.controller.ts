import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Record Vital Signs for a Patient
 */
export const createVitalSigns = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, bpSystolic, bpDiastolic, heartRate, respiratoryRate, temperature, oxygenSaturation, painScore, weight, height, source } = req.body;

    // Calculate BMI if weight (kg) and height (cm) are provided
    let bmi = null;
    if (weight && height) {
      const heightInMeters = height / 100;
      bmi = parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(2));
    }

    const vitals = await prisma.vitalSigns.create({
      data: {
        patientId,
        bpSystolic,
        bpDiastolic,
        heartRate,
        respiratoryRate,
        temperature,
        oxygenSaturation,
        painScore,
        weight,
        height,
        bmi,
        source: source || 'WARD',
        recordedBy: req.user?.id // Processed by user ID (which links to Staff)
      }
    });

    res.status(201).json(vitals);
  } catch (error) {
    console.error("Create Vitals Error:", error);
    res.status(500).json({ message: "Failed to record vital signs" });
  }
};

/**
 * Get Vital Signs History for a Patient
 */
export const getVitalSignsByPatient = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;

    const vitals = await prisma.vitalSigns.findMany({
      where: { patientId: String(patientId) },
      orderBy: { recordedAt: 'desc' }
    });

    res.json(vitals);
  } catch (error) {
    console.error("Get Vitals Error:", error);
    res.status(500).json({ message: "Failed to fetch vital signs" });
  }
};
