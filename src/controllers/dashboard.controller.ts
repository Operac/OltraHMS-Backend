import { Request, Response } from 'express';
import { PrismaClient, Role, AppointmentStatus, Status } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {


    // 1. Total Patients
    const totalPatients = await prisma.patient.count();
    
    // 2. Today's Appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayAppointments = await prisma.appointment.count({
        where: {
            startTime: {
                gte: today,
                lt: tomorrow
            },
            status: { not: AppointmentStatus.CANCELLED } // exclude cancelled? or include? Usually exclude.
        }
    });

    // 3. Active Staff (Doctors + Nurses + etc.)
    const activeStaff = await prisma.staff.count({
        where: { employmentStatus: 'ACTIVE' }
    });

    res.json({
        totalPatients,
        todayAppointments,
        activeStaff
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard stats', error });
  }
};
