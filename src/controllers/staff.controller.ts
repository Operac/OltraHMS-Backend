import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

export const getDoctors = async (req: AuthRequest, res: Response) => {
  try {
    const doctors = await prisma.user.findMany({
        where: { role: Role.DOCTOR, status: 'ACTIVE' },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staff: {
                select: {
                    id: true, // This is the ID we need for appointment.doctorId
                    specialization: true,
                    departmentId: true
                }
            }
        }
    });

    // Filter out users who might have role DOCTOR but no Staff record (data inconsistency protection)
    const validDoctors = doctors
        .filter(d => d.staff !== null)
        .map(d => ({
            id: d.staff!.id, // Staff ID
            userId: d.id,
            name: `${d.firstName} ${d.lastName}`,
            specialization: d.staff!.specialization || 'General',
            email: d.email
        }));

    res.json(validDoctors);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch doctors', error });
  }
};
