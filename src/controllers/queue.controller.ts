import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { runSerializable } from '../lib/dbRetry';
import { AuthRequest } from '../middleware/auth.middleware';
import { InsuranceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {  
    notifyPatientCheckedIn, 
    notifyPatientCalled, 
    notifyPatientWithDoctor, 
    notifyPatientCompleted,
    notifyQueueUpdate 
} from '../services/queueEvents';

// Validate patient insurance (NHIS/HMO)
export const validatePatientInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const patientId = req.params.patientId as string;
        
        // Get patient's primary insurance
        const insurance = await prisma.patientInsurance.findFirst({
            where: { patientId, isPrimary: true },
            orderBy: { createdAt: 'desc' }
        });
        
        if (!insurance) {
            return res.json({ 
                hasInsurance: false, 
                verified: false,
                message: 'No insurance on file' 
            });
        }
        
        const now = new Date();
        let isValid = true;
        let status = insurance.status;
        let message = '';
        
        // Check expiration
        if (insurance.validUntil && new Date(insurance.validUntil) < now) {
            isValid = false;
            status = InsuranceStatus.EXPIRED;
            message = 'Insurance has expired';
        }
        
        // Check if pending verification
        if (status === InsuranceStatus.PENDING) {
            isValid = false;
            message = 'Insurance pending verification';
        }
        
        // Check if rejected
        if (status === InsuranceStatus.REJECTED) {
            isValid = false;
            message = insurance.verificationNote || 'Insurance verification rejected';
        }
        
        // Return verification status
        res.json({
            hasInsurance: true,
            verified: isValid && status === InsuranceStatus.VERIFIED,
            status,
            provider: insurance.provider,
            policyNumber: insurance.policyNumber,
            validFrom: insurance.validFrom,
            validUntil: insurance.validUntil,
            message: message || (isValid ? 'Insurance verified' : 'Insurance not verified'),
            coverageDetails: insurance.coverageDetails
        });
    } catch (error) {
        console.error('Insurance validation error:', error);
        res.status(500).json({ message: 'Failed to validate insurance' });
    }
};

// Get queue for a specific doctor or department
export const getDoctorQueue = async (req: AuthRequest, res: Response) => {
    try {
        const doctorId = req.params?.doctorId;
        const date = req.query?.date as string | undefined;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const whereClause: any = {
            appointmentDate: { gte: startOfDay, lte: endOfDay },
            status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }
        };
        if (doctorId) whereClause.doctorId = doctorId;

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            orderBy: [{ queuePosition: 'asc' }, { startTime: 'asc' }],
            include: {
                patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, phone: true } },
                doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
            }
        });

        const waiting = appointments.filter(a => a.status === 'CHECKED_IN').length;
        res.json({ appointments, stats: { total: appointments.length, waiting, avgWaitTime: waiting * 15 } });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch queue' });
    }
};

// Get all queues
export const getAllQueues = async (req: AuthRequest, res: Response) => {
    try {
        const date = req.query?.date as string | undefined;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const appointments = await prisma.appointment.findMany({
            where: { appointmentDate: { gte: startOfDay, lte: endOfDay }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] } },
            include: {
                patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, phone: true } },
                doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
            }
        });

        const doctorQueues: any[] = [];
        const grouped: Record<string, any> = {};
        appointments.forEach(apt => {
            if (!grouped[apt.doctorId]) {
                grouped[apt.doctorId] = { doctor: apt.doctor, appointments: [], waiting: 0 };
            }
            grouped[apt.doctorId].appointments.push(apt);
            if (apt.status === 'CHECKED_IN') grouped[apt.doctorId].waiting++;
        });
        
        Object.values(grouped).forEach((g: any) => doctorQueues.push(g));

        res.json({
            queues: doctorQueues,
            stats: { totalPatients: appointments.length, totalWaiting: appointments.filter(a => a.status === 'CHECKED_IN').length, totalDoctors: Object.keys(grouped).length }
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch queues' });
    }
};

// Check in patient with insurance validation
export const checkInPatient = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId, priority, skipInsuranceCheck } = req.body;
        
        // First get the patient ID for the appointment
        const appointment = await prisma.appointment.findUnique({ 
            where: { id: appointmentId },
            select: { 
                id: true, 
                patientId: true, 
                doctorId: true, 
                status: true 
            }
        });
        
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        if (appointment.status === 'CHECKED_IN' || appointment.status === 'IN_PROGRESS') {
            return res.status(400).json({ message: 'Already checked in' });
        }

        // Check insurance if not skipped
        if (!skipInsuranceCheck) {
            const insurance = await prisma.patientInsurance.findFirst({
                where: { patientId: appointment.patientId, isPrimary: true }
            });
            
            if (insurance) {
                const now = new Date();
                let insuranceValid = true;
                let insuranceMessage = '';
                
                // Check expiration
                if (insurance.validUntil && new Date(insurance.validUntil) < now) {
                    insuranceValid = false;
                    insuranceMessage = 'Insurance expired';
                }
                
                // Check verification status
                if (insurance.status === InsuranceStatus.PENDING) {
                    insuranceValid = false;
                    insuranceMessage = 'Insurance pending verification';
                }
                
                if (insurance.status === InsuranceStatus.REJECTED) {
                    insuranceValid = false;
                    insuranceMessage = insurance.verificationNote || 'Insurance rejected';
                }
                
                // Return warning but allow check-in
                if (!insuranceValid) {
                    return res.status(200).json({
                        requiresAttention: true,
                        insuranceWarning: true,
                        message: insuranceMessage,
                        insuranceStatus: insurance.status,
                        proceedWithCheckIn: false
                    });
                }
            }
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        // Compute the next queue number and apply it atomically so two concurrent
        // check-ins for the same doctor cannot be assigned the same position.
        const updated = await runSerializable(async (tx) => {
            const maxQueue = await tx.appointment.aggregate({
                where: { doctorId: appointment.doctorId, appointmentDate: { gte: today, lt: tomorrow }, queuePosition: { not: null } },
                _max: { queuePosition: true }
            });
            const queuePosition = priority === 'emergency' ? 1 : ((maxQueue._max.queuePosition || 0) + 1);
            const estimatedWait = queuePosition * 15;
            return tx.appointment.update({
                where: { id: appointmentId },
                data: { status: 'CHECKED_IN', queuePosition, estimatedWaitTime: estimatedWait },
                include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } } }
            });
        });

        res.json({ message: 'Checked in', appointment: updated, queuePosition: updated.queuePosition, estimatedWaitTime: updated.estimatedWaitTime });
        
        // Emit socket event for real-time update
        notifyPatientCheckedIn(appointmentId).catch(console.error);
        notifyQueueUpdate(appointment.doctorId).catch(console.error);
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ message: 'Failed to check in' });
    }
};

// Add walk-in
export const addWalkIn = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, doctorId, reason, priority, patientData } = req.body;
        
        let patient;
        
        // If patientId provided, look up existing patient
        if (patientId) {
            patient = await prisma.patient.findUnique({ where: { id: patientId } });
            if (!patient) return res.status(404).json({ message: 'Patient not found' });
        } 
        // If patientData provided, create new patient
        else if (patientData) {
            const { firstName, lastName, phone, email, dateOfBirth, gender } = patientData;
            
            if (!firstName || !lastName || !phone) {
                return res.status(400).json({ message: 'Name and phone number are required for new patients' });
            }
            
            // Check if patient with same phone exists
            const existingPatient = await prisma.patient.findFirst({ where: { phone } });
            if (existingPatient) {
                return res.status(400).json({ 
                    message: 'A patient with this phone number already exists',
                    existingPatientId: existingPatient.id,
                    existingPatientName: `${existingPatient.firstName} ${existingPatient.lastName}`
                });
            }
            
            // Generate patient number
            const patientNumber = `HMS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
            
            // Create user first
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(tempPassword, 12);
            
            const user = await prisma.user.create({
                data: {
                    email: email || `${phone}@oltra.local`,
                    passwordHash: hashedPassword,
                    firstName,
                    lastName,
                    role: 'PATIENT',
                    status: 'ACTIVE'
                }
            });
            
            // Create patient
            patient = await prisma.patient.create({
                data: {
                    userId: user.id,
                    patientNumber,
                    firstName,
                    lastName,
                    phone,
                    ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
                    ...(gender && { gender })
                }
            });
        } else {
            return res.status(400).json({ message: 'Either patientId or patientData is required' });
        }
        
        if (!doctorId) return res.status(400).json({ message: 'Doctor ID required' });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        // Compute the next queue number and create the walk-in atomically so two
        // concurrent walk-ins for the same doctor cannot share a queue position.
        const appointment = await runSerializable(async (tx) => {
            const maxQueue = await tx.appointment.aggregate({
                where: { doctorId, appointmentDate: { gte: today, lt: tomorrow }, queuePosition: { not: null } },
                _max: { queuePosition: true }
            });
            const queuePosition = priority === 'emergency' ? 1 : ((maxQueue._max.queuePosition || 0) + 1);
            const estimatedWait = queuePosition * 15;
            return tx.appointment.create({
                data: {
                    patientId: patient.id, doctorId,
                    appointmentDate: today,
                    startTime: new Date(),
                    endTime: new Date(Date.now() + 30 * 60000),
                    type: priority === 'emergency' ? 'EMERGENCY' : 'FIRST_VISIT', status: 'CHECKED_IN', reason: reason || 'Walk-in',
                    queuePosition, estimatedWaitTime: estimatedWait
                },
            });
        });

        res.status(201).json({
            message: 'Walk-in added',
            appointment,
            queuePosition: appointment.queuePosition,
            patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, patientNumber: patient.patientNumber }
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to add walk-in' });
    }
};

// Call next patient - with Triage Gate (vitals required)
export const callNextPatient = async (req: AuthRequest, res: Response) => {
    try {
        const { doctorId, skipTriageCheck } = req.body;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        // Get waiting patients
        const waitingPatients = await prisma.appointment.findMany({
            where: { doctorId, status: 'CHECKED_IN' },
            orderBy: { queuePosition: 'asc' },
            select: {
                id: true,
                patientId: true,
                queuePosition: true,
                patient: { select: { firstName: true, lastName: true } }
            }
        });

        if (waitingPatients.length === 0) {
            return res.json({ message: 'No patients in queue', currentPatient: null });
        }

        let nextPatient = null;

        // Check if triage/vitals is required
        if (!skipTriageCheck) {
            // Get today's vitals for all waiting patients
            const patientIds = waitingPatients.map(p => p.patientId);
            const todayVitals = await prisma.vitalSigns.findMany({
                where: {
                    patientId: { in: patientIds },
                    recordedAt: { gte: today, lt: tomorrow }
                },
                select: { patientId: true }
            });
            const patientsWithVitals = new Set(todayVitals.map(v => v.patientId));

            // Find first patient with vitals
            nextPatient = waitingPatients.find(p => patientsWithVitals.has(p.patientId)) || null;
            
            // If no patient with vitals, check if any patient has vitals
            const hasAnyVitals = waitingPatients.some(p => patientsWithVitals.has(p.patientId));
            
            // If no vitals at all yet, allow first patient (backwards compatibility)
            if (!nextPatient && !hasAnyVitals) {
                nextPatient = waitingPatients[0];
            }
            
            // If some have vitals and some don't, warn about triage requirement
            if (!nextPatient && hasAnyVitals) {
                return res.status(400).json({ 
                    message: 'Please complete triage (vitals) before calling next patient', 
                    requiresTriage: true,
                    waitingWithoutVitals: waitingPatients.filter(p => !patientsWithVitals.has(p.patientId)).length
                });
            }
        } else {
            // Skip triage check - use first in queue
            nextPatient = waitingPatients[0];
        }

        if (!nextPatient) return res.json({ message: 'No patients in queue', currentPatient: null });

        const updated = await prisma.appointment.update({
            where: { id: nextPatient.id },
            data: { status: 'IN_PROGRESS', startTime: new Date() },
            include: { patient: { select: { id: true, firstName: true, lastName: true } } }
        });

        res.json({ currentPatient: updated });
        
        // Emit socket event
        notifyPatientCalled(nextPatient.id).catch(console.error);
        notifyPatientWithDoctor(nextPatient.id).catch(console.error);
        notifyQueueUpdate(doctorId).catch(console.error);
    } catch (error) {
        res.status(500).json({ message: 'Failed to call patient' });
    }
};

// Reassign patient to different doctor
export const reassignPatient = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId, newDoctorId, reason } = req.body;
        const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        const targetDoctorId = newDoctorId;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        const maxQueue = await prisma.appointment.aggregate({
            where: { doctorId: targetDoctorId, appointmentDate: { gte: today, lt: tomorrow }, queuePosition: { not: null } },
            _max: { queuePosition: true }
        });

        const queuePosition = ((maxQueue._max.queuePosition || 0) + 1);
        const updated = await prisma.appointment.update({
            where: { id: appointmentId },
            data: { doctorId: newDoctorId, queuePosition, estimatedWaitTime: queuePosition * 15, notes: reason ? `${appointment.notes || ''}\nReassigned: ${reason}` : appointment.notes },
            include: { patient: { select: { id: true, firstName: true, lastName: true } } }
        });

        res.json({ message: 'Patient reassigned', appointment: updated });
    } catch (error) {
        res.status(500).json({ message: 'Failed to reassign patient' });
    }
};

// Update queue position
export const updateQueuePosition = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId, newPosition } = req.body;
        const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        const newDoctorId = appointment.doctorId;
        await prisma.appointment.update({ where: { id: appointmentId }, data: { queuePosition: newPosition, estimatedWaitTime: newPosition * 15 } });
        notifyQueueUpdate(newDoctorId).catch(console.error);
        res.json({ message: 'Queue updated' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update queue' });
    }
};

// Remove from queue
export const removeFromQueue = async (req: AuthRequest, res: Response) => {
    try {
        const { appointmentId } = req.body;
        const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'CONFIRMED', queuePosition: null, estimatedWaitTime: null } });
        notifyPatientCompleted(appointmentId).catch(console.error);
        if (appointment?.doctorId) {
            notifyQueueUpdate(appointment.doctorId).catch(console.error);
        }
        res.json({ message: 'Removed from queue' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to remove from queue' });
    }
};

// Get available doctors for walk-in assignment
export const getAvailableDoctors = async (req: AuthRequest, res: Response) => {
    try {
        // Get users with DOCTOR role and their staff records
        const users = await prisma.user.findMany({
            where: { role: 'DOCTOR', status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true }
        });
        
        // Get staff records for these users
        const staffIds = users.map(u => u.id);
        const staff = await prisma.staff.findMany({
            where: { userId: { in: staffIds }, employmentStatus: 'ACTIVE' },
            include: { department: true }
        });
        
        // Map staff to users
        const staffByUserId: Record<string, any> = {};
        staff.forEach(s => { staffByUserId[s.userId] = s; });
        
        // Get today's queue count for each doctor
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        
        const appointments = await prisma.appointment.findMany({
            where: {
                appointmentDate: { gte: today, lt: tomorrow },
                status: { in: ['CHECKED_IN', 'IN_PROGRESS'] }
            }
        });
        
        const doctorQueueCount: Record<string, number> = {};
        appointments.forEach(apt => {
            doctorQueueCount[apt.doctorId] = (doctorQueueCount[apt.doctorId] || 0) + 1;
        });
        
        const doctorsWithQueue = users.map(u => {
            const staffRecord = staffByUserId[u.id];
            return {
                id: staffRecord?.id || u.id,
                name: `${u.firstName} ${u.lastName}`,
                department: staffRecord?.department?.name,
                currentQueue: doctorQueueCount[staffRecord?.id || u.id] || 0
            };
        });
        
        res.json(doctorsWithQueue);
    } catch (error) {
        console.error('Error fetching available doctors:', error);
        res.status(500).json({ message: 'Failed to fetch doctors' });
    }
};

// Cancel check-in (alias for removeFromQueue)
export const cancelCheckIn = async (req: AuthRequest, res: Response) => {
    try {
        const appointmentId = req.params.appointmentId as string;
        await prisma.appointment.update({ 
            where: { id: appointmentId }, 
            data: { status: 'CONFIRMED', queuePosition: null, estimatedWaitTime: null } 
        });
        res.json({ message: 'Check-in cancelled' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to cancel check-in' });
    }
};
