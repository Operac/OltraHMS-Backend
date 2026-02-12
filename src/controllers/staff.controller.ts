import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

export const getDoctors = async (req: AuthRequest, res: Response) => {
  try {
    // Fetch users with role DOCTOR and include their staff profile
    // OR fetch Staff who are doctors? 
    // Schema: User has role. Staff links to User. 
    // Best to query Staff where user.role is DOCTOR?
    
    // Simplest: Find Users with role DOCTOR, include Staff info.
    // Or Find Staff, include User, filter by User.role?
    // Let's traverse from Staff, assuming all Staff have entries?
    // Actually, role is on User.
    
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
