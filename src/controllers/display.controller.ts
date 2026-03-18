import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get current queue display for a department or all
export const getQueueDisplay = async (req: Request, res: Response) => {
    try {
        const departmentId = req.params.departmentId as string | undefined;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Build where clause
        const whereClause: any = {
            appointmentDate: { gte: today, lt: tomorrow },
            status: { in: ['CHECKED_IN', 'IN_PROGRESS'] }
        };

        // If department specified, get doctors in that department
        if (departmentId) {
            // Get users with DOCTOR role in that department
            const users = await prisma.user.findMany({
                where: { role: 'DOCTOR', status: 'ACTIVE' },
                select: { id: true }
            });
            const userIds = users.map(u => u.id);
            const doctors = await prisma.staff.findMany({
                where: { userId: { in: userIds }, departmentId, employmentStatus: 'ACTIVE' },
                select: { id: true }
            });
            const doctorIds = doctors.map(d => d.id);
            whereClause.doctorId = { in: doctorIds };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            orderBy: [{ queuePosition: 'asc' }, { startTime: 'asc' }],
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                doctor: { 
                    include: { 
                        user: { select: { firstName: true, lastName: true } },
                        department: { select: { name: true } }
                    } 
                }
            }
        });

        // Group by doctor
        const doctorQueues: Record<string, any> = {};
        appointments.forEach(apt => {
            if (!doctorQueues[apt.doctorId]) {
                doctorQueues[apt.doctorId] = {
                    doctorName: apt.doctor ? `${apt.doctor.user.firstName} ${apt.doctor.user.lastName}` : 'Unknown',
                    department: apt.doctor?.department?.name || 'General',
                    currentPatient: null,
                    waiting: []
                };
            }

            if (apt.status === 'IN_PROGRESS') {
                doctorQueues[apt.doctorId].currentPatient = {
                    tokenNumber: apt.queuePosition || 0,
                    name: `${apt.patient.firstName} ${apt.patient.lastName}`,
                    patientNumber: apt.patient.patientNumber
                };
            } else {
                doctorQueues[apt.doctorId].waiting.push({
                    tokenNumber: apt.queuePosition || 0,
                    name: `${apt.patient.firstName} ${apt.patient.lastName}`,
                    patientNumber: apt.patient.patientNumber
                });
            }
        });

        // Get overall stats
        const stats = {
            totalWaiting: appointments.filter(a => a.status === 'CHECKED_IN').length,
            totalInProgress: appointments.filter(a => a.status === 'IN_PROGRESS').length,
            totalDoctors: Object.keys(doctorQueues).length
        };

        res.json({
            timestamp: new Date(),
            stats,
            queues: Object.values(doctorQueues)
        });
    } catch (error) {
        console.error('Error fetching queue display:', error);
        res.status(500).json({ message: 'Failed to fetch queue display' });
    }
};

// Get single doctor display (for individual screens)
export const getDoctorDisplay = async (req: Request, res: Response) => {
    try {
        const doctorId = req.params.doctorId as string;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const appointments = await prisma.appointment.findMany({
            where: {
                doctorId,
                appointmentDate: { gte: today, lt: tomorrow },
                status: { in: ['CHECKED_IN', 'IN_PROGRESS'] }
            },
            orderBy: [{ queuePosition: 'asc' }, { startTime: 'asc' }],
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
            }
        });

        const doctor = await prisma.staff.findUnique({
            where: { id: doctorId },
            include: {
                user: { select: { firstName: true, lastName: true } },
                department: { select: { name: true } }
            }
        });

        let currentPatient = null;
        const waiting: Array<{ tokenNumber: number; name: string; patientNumber: string }> = [];

        appointments.forEach(apt => {
            if (apt.status === 'IN_PROGRESS') {
                currentPatient = {
                    tokenNumber: apt.queuePosition || 0,
                    name: `${apt.patient.firstName} ${apt.patient.lastName}`,
                    patientNumber: apt.patient.patientNumber
                };
            } else {
                waiting.push({
                    tokenNumber: apt.queuePosition || 0,
                    name: `${apt.patient.firstName} ${apt.patient.lastName}`,
                    patientNumber: apt.patient.patientNumber
                });
            }
        });

        res.json({
            timestamp: new Date(),
            doctor: doctor ? {
                name: `${doctor.user.firstName} ${doctor.user.lastName}`,
                department: doctor.department?.name
            } : null,
            currentPatient,
            waiting,
            waitingCount: waiting.length
        });
    } catch (error) {
        console.error('Error fetching doctor display:', error);
        res.status(500).json({ message: 'Failed to fetch doctor display' });
    }
};

export default {
    getQueueDisplay,
    getDoctorDisplay
};
