import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';

export const createVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.body;

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { 
                patient: { include: { user: true } },
                doctor: { include: { user: true } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Check for existing active session
        const existingSession = await prisma.videoSession.findUnique({
            where: { appointmentId }
        });

        if (existingSession && existingSession.status === 'ACTIVE') {
            return res.json(existingSession);
        }

        // Create new session
        // We'll use the appointmentID as the Room ID for simplicity
        const session = await prisma.videoSession.create({
            data: {
                appointmentId,
                roomId: appointmentId, 
                status: 'ACTIVE'
            }
        });

        // Notify Patient
        if (appointment.patient.user) {
            await NotificationService.sendTelemedicineInvite(
                appointment.patient.userId,
                `/consultation/video/${appointmentId}`
            );
        }

        res.status(201).json(session);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create video session' });
    }
};

export const endVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.body;

        const session = await prisma.videoSession.findUnique({
            where: { appointmentId }
        });

        if (!session) return res.status(404).json({ message: 'Session not found' });

        const updated = await prisma.videoSession.update({
            where: { id: session.id },
            data: {
                status: 'ENDED',
                endedAt: new Date()
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Failed to end session' });
    }
};

export const getVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const session = await prisma.videoSession.findUnique({
            where: { appointmentId: String(appointmentId) }
        });
        res.json(session);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get session' });
    }
}
