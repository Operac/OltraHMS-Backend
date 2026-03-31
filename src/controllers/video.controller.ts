import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import { generateJitsiToken, generateRoomName, getJitsiConfig } from '../services/jitsi.service';
import { PaymentConfirmationStatus, VideoSessionStatus } from '@prisma/client';

export const createVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { 
                patient: { include: { user: true } },
                doctor: { include: { user: true } },
                invoice: true
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // AUTHORIZATION: Verify the requester is the doctor or patient on this appointment
        const isDoctor = appointment.doctor.userId === userId;
        const isPatient = appointment.patient.userId === userId;
        if (!isDoctor && !isPatient) {
            return res.status(403).json({ message: 'Unauthorized: You are not part of this appointment' });
        }

        // PAYMENT GATE: Block if no invoice OR if invoice not confirmed
        const invoice = appointment.invoice;
        if (!invoice) {
            return res.status(402).json({ 
                message: 'Invoice not generated yet. Please complete check-in.',
                requiresPayment: true
            });
        }
        
        if (invoice && invoice.paymentConfirmationStatus !== PaymentConfirmationStatus.CONFIRMED) {
            return res.status(402).json({ 
                message: 'Payment not confirmed. Please confirm payment before starting telemedicine session.',
                requiresPayment: true,
                paymentStatus: invoice.paymentConfirmationStatus
            });
        }

        // Check for existing active session
        const existingSession = await prisma.videoSession.findUnique({
            where: { appointmentId }
        });

        if (existingSession && existingSession.status === VideoSessionStatus.ACTIVE) {
            // Return existing session with Jitsi config
            const jitsiConfig = getJitsiConfig();
            const doctorToken = jitsiConfig.useToken 
                ? generateJitsiToken(existingSession.roomId, appointment.doctor.user.firstName || 'Doctor', true)
                : null;
            const patientToken = jitsiConfig.useToken 
                ? generateJitsiToken(existingSession.roomId, appointment.patient.user.firstName || 'Patient', false)
                : null;

            return res.json({
                ...existingSession,
                jitsiUrl: jitsiConfig.url,
                token: doctorToken?.token || null,
                patientToken: patientToken?.token || null,
                useToken: jitsiConfig.useToken
            });
        }

        // Create new session with Jitsi room
        const roomName = generateRoomName(appointmentId);
        const session = await prisma.videoSession.create({
            data: {
                appointmentId,
                roomId: roomName,
                status: VideoSessionStatus.ACTIVE
            }
        });

        // Get Jitsi configuration
        const jitsiConfig = getJitsiConfig();
        const doctorToken = jitsiConfig.useToken 
            ? generateJitsiToken(roomName, appointment.doctor.user.firstName || 'Doctor', true)
            : null;
        const patientToken = jitsiConfig.useToken 
            ? generateJitsiToken(roomName, appointment.patient.user.firstName || 'Patient', false)
            : null;

        // Notify Patient
        if (appointment.patient.user) {
            await NotificationService.sendTelemedicineInvite(
                appointment.patient.userId,
                `/consultation/video/${appointmentId}`
            );
        }

        res.status(201).json({
            ...session,
            jitsiUrl: jitsiConfig.url,
            token: doctorToken?.token || null,
            patientToken: patientToken?.token || null,
            useToken: jitsiConfig.useToken
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create video session' });
    }
};

export const endVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { 
                patient: { include: { user: true } },
                doctor: { include: { user: true } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // AUTHORIZATION: Verify the requester is the doctor or patient on this appointment
        const isDoctor = appointment.doctor.userId === userId;
        const isPatient = appointment.patient.userId === userId;
        if (!isDoctor && !isPatient) {
            return res.status(403).json({ message: 'Unauthorized: You are not part of this appointment' });
        }

        const session = await prisma.videoSession.findUnique({
            where: { appointmentId }
        });

        if (!session) return res.status(404).json({ message: 'Session not found' });

        // GUARD: Check if session is already ended
        if (session.status === VideoSessionStatus.ENDED) {
            return res.status(400).json({ message: 'Session already ended' });
        }

        // Update video session status
        const updated = await prisma.videoSession.update({
            where: { id: session.id },
            data: {
                status: VideoSessionStatus.ENDED,
                endedAt: new Date()
            }
        });

        // Update appointment status to COMPLETED
        await prisma.appointment.update({
            where: { id: appointmentId },
            data: { status: 'COMPLETED' }
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to end session' });
    }
};

export const getVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: String(appointmentId) },
            include: { 
                patient: { include: { user: true } },
                doctor: { include: { user: true } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // AUTHORIZATION: Verify the requester is the doctor or patient on this appointment
        const isDoctor = appointment.doctor.userId === userId;
        const isPatient = appointment.patient.userId === userId;
        if (!isDoctor && !isPatient) {
            return res.status(403).json({ message: 'Unauthorized: You are not part of this appointment' });
        }

        const session = await prisma.videoSession.findUnique({
            where: { appointmentId: String(appointmentId) }
        });
        
        if (!session) return res.status(404).json({ message: 'Session not found' });
        
        res.json(session);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to get session' });
    }
}
