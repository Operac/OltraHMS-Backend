import { Request, Response } from 'express';
import { PrismaClient, AppointmentStatus, StaffDailyStatus } from '@prisma/client';
import { z } from 'zod';
import { startOfDay, endOfDay } from 'date-fns';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendAppointmentConfirmationEmail } from '../services/email.service';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../services/calendar.service';
import { createNotification } from './notification.controller';
import { sendToUser } from '../services/notification.service';
import { randomBytes } from 'crypto';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

// Helper function to validate doctor schedule
const checkDoctorAvailability = async (doctorId: string, start: Date, end: Date, bypassCheck: boolean): Promise<{ isValid: boolean; message?: string }> => {
    if (bypassCheck) return { isValid: true };

    const doctorStaff = await prisma.staff.findUnique({
        where: { id: doctorId },
        include: {
            dailyAvailabilities: {
                where: {
                    date: {
                        gte: startOfDay(start),
                        lte: endOfDay(start)
                    }
                }
            }
        }
    });

    if (!doctorStaff) return { isValid: false, message: 'Doctor (Staff) not found' };

    const dayOfWeek = start.getDay();
    const override = doctorStaff.dailyAvailabilities?.[0];

    if (override && override.status !== StaffDailyStatus.AVAILABLE) {
        return { isValid: false, message: `Doctor is marked as ${override.status} on this date` };
    }

    let isOpen = false;
    let shiftStart = '';
    let shiftEnd = '';

    switch (dayOfWeek) {
        case 0: isOpen = doctorStaff.sundayIsOpen; shiftStart = doctorStaff.sundayStart; shiftEnd = doctorStaff.sundayEnd; break;
        case 1: isOpen = doctorStaff.mondayIsOpen; shiftStart = doctorStaff.mondayStart; shiftEnd = doctorStaff.mondayEnd; break;
        case 2: isOpen = doctorStaff.tuesdayIsOpen; shiftStart = doctorStaff.tuesdayStart; shiftEnd = doctorStaff.tuesdayEnd; break;
        case 3: isOpen = doctorStaff.wednesdayIsOpen; shiftStart = doctorStaff.wednesdayStart; shiftEnd = doctorStaff.wednesdayEnd; break;
        case 4: isOpen = doctorStaff.thursdayIsOpen; shiftStart = doctorStaff.thursdayStart; shiftEnd = doctorStaff.thursdayEnd; break;
        case 5: isOpen = doctorStaff.fridayIsOpen; shiftStart = doctorStaff.fridayStart; shiftEnd = doctorStaff.fridayEnd; break;
        case 6: isOpen = doctorStaff.saturdayIsOpen; shiftStart = doctorStaff.saturdayStart; shiftEnd = doctorStaff.saturdayEnd; break;
    }

    if (!isOpen) {
        return { isValid: false, message: 'Doctor is not available on this day of the week' };
    }

    const [startH, startM] = shiftStart.split(':').map(Number);
    const [endH, endM] = shiftEnd.split(':').map(Number);

    const shiftStartTime = new Date(start);
    shiftStartTime.setHours(startH, startM, 0, 0);

    const shiftEndTime = new Date(start);
    shiftEndTime.setHours(endH, endM, 0, 0);

    if (start < shiftStartTime || end > shiftEndTime) {
        return { isValid: false, message: `Doctor's working hours are ${shiftStart} to ${shiftEnd}` };
    }

    return { isValid: true };
};

const getAppointmentServiceName = (appointmentType: string) => {
    // These names must exist in the Service Pricing table (Service.name)
    // Finance can adjust price via Service.price without changing code.
    if (appointmentType === 'TELEMEDICINE') return 'Telemedicine Consultation';
    return 'Consultation';
};

const ensureAppointmentInvoice = async (appointmentId: string) => {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { medicalRecord: true, invoice: true }
    });

    if (!appointment) {
        const err: any = new Error('Appointment not found');
        err.statusCode = 404;
        throw err;
    }

    // Already generated
    if (appointment.invoice) return appointment.invoice;

    const serviceName = getAppointmentServiceName(String(appointment.type));
    const service = await prisma.service.findUnique({ where: { name: serviceName } });

    if (!service || !service.price || service.price <= 0) {
        const err: any = new Error(
            `Pricing not configured. Please create/update Service "${serviceName}" with a positive price.`
        );
        err.statusCode = 400;
        throw err;
    }

    const price = service.price;

    // Create invoice linked to appointment (Invoice.appointmentId is the FK)
    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber: generateInvoiceNumber('INV-APPT'),
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            medicalRecordId: appointment.medicalRecord?.id || null,
            status: 'ISSUED',
            items: [
                {
                    itemType: 'APPOINTMENT',
                    itemId: appointment.id,
                    name: serviceName,
                    quantity: 1,
                    unitPrice: price,
                    total: price
                }
            ],
            subtotal: price,
            tax: 0,
            total: price,
            balance: price
        }
    });

    return invoice;
};

// Modified to allow patientId to be optional if user is a PATIENT
const createAppointmentSchema = z.object({
  patientId: z.string().optional(), // Optional for patients
  moduleIdParam: z.string().optional(),
  doctorId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  type: z.string().min(1),
  reason: z.string().optional(),
});

export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    let { patientId, doctorId, startTime, endTime, type, reason } = createAppointmentSchema.parse(req.body);

    // If I am a patient, I can only book for myself
    if (req.user?.role === 'PATIENT') {
        // PRE-PAYMENT GATE: Patients must clear payment before booking appointments
        const unpaidInvoices = await prisma.invoice.findMany({
            where: { patientId: req.user.id, balance: { gt: 0 } },
            take: 1
        });
        if (unpaidInvoices.length > 0) {
            return res.status(402).json({
                message: `Payment required before booking appointments. Outstanding balance: ₦${unpaidInvoices[0].balance.toLocaleString()}`,
                requiredPayment: unpaidInvoices[0].balance
            });
        }
        const patientProfile = await prisma.patient.findFirst({ where: { userId: req.user.id } });
        if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
        
        // Force patientId to be my own
        patientId = patientProfile.id;
    }

    if (!patientId) return res.status(400).json({ message: 'Patient ID is required' });


    // Validate Doctor exists
    const doctorStaff = await prisma.staff.findUnique({ 
        where: { id: doctorId },
        include: { user: true }
    });

    if (!doctorStaff) return res.status(404).json({ message: 'Doctor (Staff) not found' });
    
    // Validate Patient existence
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start < new Date()) {
        return res.status(400).json({ message: 'Cannot book appointments in the past' });
    }

    if (start >= end) {
        return res.status(400).json({ message: 'Start time must be before end time' });
    }

    // Check doctor schedule/availability
    const adminOrReceptionist = ['ADMIN', 'RECEPTIONIST'].includes(req.user?.role || '');
    const availability = await checkDoctorAvailability(doctorId, start, end, adminOrReceptionist);
    
    if (!availability.isValid) {
        return res.status(400).json({ message: availability.message });
    }

    // Check for overlaps for this doctor
    const overlap = await prisma.appointment.findFirst({
        where: {
            doctorId, // Relates to Staff.id
            status: { not: AppointmentStatus.CANCELLED },
            OR: [
                { startTime: { lte: start }, endTime: { gt: start } },
                { startTime: { lt: end }, endTime: { gte: end } },
                { startTime: { gte: start }, endTime: { lte: end } }
            ]
        }
    });

    if (overlap) {
        return res.status(409).json({ message: 'Doctor is not available at this time' });
    }

    const appointment = await prisma.appointment.create({
        data: {
            patientId,
            doctorId,
            appointmentDate: start,
            startTime: start,
            endTime: end,
            type: type as any, // Only if matches enum, otherwise strictly: type as 'FIRST_VISIT' | 'FOLLOW_UP' | ...
            reason,
            // Auto-confirm if booked by staff, otherwise REQUESTED
            status: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'].includes(req.user?.role || '') 
                ? AppointmentStatus.CONFIRMED 
                : AppointmentStatus.REQUESTED
        },
        include: {
            patient: { 
                select: { 
                    firstName: true, 
                    lastName: true, 
                    patientNumber: true,
                    user: { select: { email: true, firstName: true, lastName: true } }
                } 
            },
            doctor: { 
                include: { 
                    user: { select: { firstName: true, lastName: true } } 
                } 
            }
        }
    });

    // Send confirmation email to patient
    if (appointment.patient?.user?.email) {
        try {
            const appointmentDate = new Date(appointment.appointmentDate);
            await sendAppointmentConfirmationEmail(
                appointment.patient.user.email,
                `${appointment.patient.firstName} ${appointment.patient.lastName}`,
                `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`,
                appointmentDate.toLocaleDateString(),
                appointmentDate.toLocaleTimeString(),
                appointment.type
            );
        } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
        }
    }

    // Create Google Calendar event
    if (process.env.GOOGLE_CALENDAR_ENABLED === 'true') {
        try {
            await createCalendarEvent(appointment.id);
        } catch (calendarError) {
            console.error('Failed to create calendar event:', calendarError);
        }
    }

    res.status(201).json(appointment);

  } catch (error) {
    if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.issues });
    }
    console.error(error); // Log real error
    res.status(500).json({ message: 'Failed to create appointment' });
  }
};

export const getAppointments = async (req: AuthRequest, res: Response) => {
    try {
        const { date, doctorId, patientId, type } = req.query;
        const user = req.user;

        const where: any = {};

        if (type) {
            where.type = String(type);
        }

        // Role-based security enforcement
        if (user?.role === 'PATIENT') {
            const patientProfile = await prisma.patient.findFirst({ where: { userId: user.id } });
            if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
            where.patientId = patientProfile.id;
        } else if (user?.role === 'DOCTOR') {
            const staffProfile = await prisma.staff.findFirst({ where: { userId: user.id } });
            if (!staffProfile) return res.status(403).json({ message: 'Staff profile not found' });
            where.doctorId = staffProfile.id;
        } else {
            // Admin/Receptionist can filter freely
            if (doctorId) where.doctorId = String(doctorId);
            if (patientId) where.patientId = String(patientId);
        }
        
        if (req.query.startDate && req.query.endDate) {
            const start = startOfDay(new Date(String(req.query.startDate)));
            const end = endOfDay(new Date(String(req.query.endDate)));
            where.startTime = { gte: start, lte: end };
        } else if (date) {
            const startDateTime = startOfDay(new Date(String(date)));
            const endDateTime = endOfDay(new Date(String(date)));
            where.startTime = { gte: startDateTime, lte: endDateTime };
        }

        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                doctor: { 
                    include: { 
                        user: { select: { firstName: true, lastName: true } } 
                    } 
                }
            },
            orderBy: { startTime: 'asc' }
        });

        res.json(appointments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch appointments' });
    }
};

export const getAppointmentById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const appointment = await prisma.appointment.findUnique({
            where: { id: String(id) },
            include: {
                patient: { 
                    select: { 
                        id: true, 
                        firstName: true, 
                        lastName: true, 
                        gender: true, 
                        dateOfBirth: true
                    } 
                },
                doctor: { include: { user: true } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch appointment' });
    }
};

export const updateAppointmentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user?.id;

        // Type guard using explicit cast or Object.values check
        if (!Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const appointment = await prisma.appointment.findUnique({ where: { id: String(id) } });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Patient authorization check
        if (req.user?.role === 'PATIENT') {
            const patient = await prisma.patient.findFirst({ where: { userId } });
            if (!patient || appointment.patientId !== patient.id) {
                return res.status(403).json({ message: 'Unauthorized to modifying this appointment' });
            }
            // Patients can only Cancel
            if (status !== AppointmentStatus.CANCELLED) {
                return res.status(403).json({ message: 'Patients can only cancel appointments' });
            }
            // Cannot modify past appointments
            if (new Date(appointment.startTime) < new Date()) {
                return res.status(400).json({ message: 'Cannot modify appointments in the past' });
            }
        }

        // Payment gate: CHECKED_IN and IN_PROGRESS require payment clearance
        const paymentGateStatuses: AppointmentStatus[] = [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS];
        const requiresPaymentGate = paymentGateStatuses.includes(status as AppointmentStatus);

        // On check-in, generate the invoice (used for consultation + telemedicine)
        if (status === AppointmentStatus.CHECKED_IN) {
            try {
                await ensureAppointmentInvoice(String(id));
            } catch (e: any) {
                const sc = e?.statusCode || 500;
                return res.status(sc).json({ message: e?.message || 'Failed to generate appointment invoice' });
            }
        }

        if (requiresPaymentGate) {
            const user = await prisma.user.findUnique({ where: { id: userId! } });
            const isAdmin = user?.role === 'ADMIN';

            if (!isAdmin && appointment.paymentStatus !== 'CLEARED' && appointment.paymentStatus !== 'WAIVED') {
                // Also check if there's a PAID invoice (backward compat)
                const hasPaidInvoice = await prisma.invoice.findFirst({
                    where: {
                        patientId: appointment.patientId,
                        status: 'PAID',
                        medicalRecordId: { not: null },
                        medicalRecord: { appointmentId: appointment.id }
                    }
                });

                if (!hasPaidInvoice) {
                    return res.status(402).json({
                        message: 'Payment required before check-in. Payment must be cleared.',
                        paymentStatus: appointment.paymentStatus
                    });
                }

                // Auto-clear if invoice is PAID
                await prisma.appointment.update({
                    where: { id: String(id) },
                    data: { paymentStatus: 'CLEARED', clearedAt: new Date() }
                });
            }
        }

        const updated = await prisma.appointment.update({
            where: { id: String(id) },
            data: { status: status as AppointmentStatus }
        });

        // Notify relevant parties on status change
        try {
            const fullAppointment = await prisma.appointment.findUnique({
                where: { id: String(id) },
                include: {
                    patient: { select: { userId: true, firstName: true, lastName: true } },
                    doctor: { select: { userId: true } }
                }
            });

            if (fullAppointment) {
                const statusMessages: Record<string, string> = {
                    CONFIRMED: 'Your appointment has been confirmed.',
                    CANCELLED: 'Your appointment has been cancelled.',
                    CHECKED_IN: 'Patient has checked in.',
                    IN_PROGRESS: 'Your appointment is in progress.',
                    COMPLETED: 'Your appointment has been completed.',
                    NO_SHOW: 'Appointment marked as no-show.'
                };

                // Notify patient
                if (fullAppointment.patient?.userId && statusMessages[status as string]) {
                    await createNotification(
                        fullAppointment.patient.userId,
                        statusMessages[status as string],
                        'MEDIUM',
                        'IN_APP'
                    );
                    sendToUser(fullAppointment.patient.userId, {
                        type: 'appointment',
                        title: 'Appointment Update',
                        message: statusMessages[status as string],
                        data: { appointmentId: fullAppointment.id }
                    });
                }

                // Notify doctor
                if (fullAppointment.doctor?.userId && statusMessages[status as string]) {
                    sendToUser(fullAppointment.doctor.userId, {
                        type: 'appointment',
                        title: 'Appointment Update',
                        message: `${statusMessages[status as string]} - ${fullAppointment.patient?.firstName} ${fullAppointment.patient?.lastName}`,
                        data: { appointmentId: fullAppointment.id }
                    });
                }
            }
        } catch (notifError) {
            console.error('Failed to send appointment notification:', notifError);
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update appointment' });
    }
};

export const rescheduleAppointment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { startTime, endTime } = req.body;
        const userId = req.user?.id;

        if (!startTime || !endTime) {
            return res.status(400).json({ message: 'Start and End time are required' });
        }

        const appointment = await prisma.appointment.findUnique({ where: { id: String(id) } });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Authorization check
        if (req.user?.role === 'PATIENT') {
            const patient = await prisma.patient.findFirst({ where: { userId } });
            if (!patient || appointment.patientId !== patient.id) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start < new Date()) {
            return res.status(400).json({ message: 'Cannot reschedule appointments into the past' });
        }

        if (start >= end) return res.status(400).json({ message: 'Invalid time range' });

        // Check doctor schedule/availability
        const adminOrReceptionist = ['ADMIN', 'RECEPTIONIST'].includes(req.user?.role || '');
        const availability = await checkDoctorAvailability(appointment.doctorId, start, end, adminOrReceptionist);
        
        if (!availability.isValid) {
            return res.status(400).json({ message: availability.message });
        }

        // Check availability (overlap)
        const overlap = await prisma.appointment.findFirst({
            where: {
                doctorId: appointment.doctorId,
                id: { not: appointment.id }, // Exclude current
                status: { not: AppointmentStatus.CANCELLED },
                OR: [
                    { startTime: { lte: start }, endTime: { gt: start } },
                    { startTime: { lt: end }, endTime: { gte: end } },
                    { startTime: { gte: start }, endTime: { lte: end } }
                ]
            }
        });

        if (overlap) {
            return res.status(409).json({ message: 'Doctor is not available at this new time' });
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { id: String(id) },
            data: {
                startTime: start,
                endTime: end,
                appointmentDate: start,
                // Reset status to REQUESTED if rescheduled by patient, or CONFIRMED if by doctor?
                // For simplicity, let's keep it CONFIRMED if it was confirmed, or REQUESTED if not.
                // Or maybe safer to reset to REQUESTED if patient changes it.
                status: req.user?.role === 'PATIENT' ? AppointmentStatus.REQUESTED : AppointmentStatus.CONFIRMED
            }
        });

        res.json(updatedAppointment);

    } catch (error) {
        console.error('Reschedule Error:', error);
        res.status(500).json({ message: 'Failed to reschedule appointment' });
    }
};

/**
 * Patient submits payment for an appointment
 * Moves paymentStatus from AWAITING_PAYMENT to PAYMENT_SUBMITTED
 */
export const submitAppointmentPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // appointmentId
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const appointment = await prisma.appointment.findUnique({
            where: { id: String(id) },
            include: {
                patient: { select: { firstName: true, lastName: true, userId: true } },
                doctor: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Patients can only submit for their own appointments
        if (req.user?.role === 'PATIENT' && appointment.patient?.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        if (appointment.paymentStatus !== 'AWAITING_PAYMENT') {
            return res.status(400).json({
                message: `Cannot submit payment. Current status: ${appointment.paymentStatus}`
            });
        }

        const updated = await prisma.appointment.update({
            where: { id: String(id) },
            data: { paymentStatus: 'PAYMENT_SUBMITTED' }
        });

        // Notify finance/accountant staff
        const staffUsers = await prisma.staff.findMany({
            where: { user: { role: { in: ['ACCOUNTANT', 'ADMIN'] } } },
            select: { userId: true }
        });

        const doctorName = appointment.doctor?.user ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : 'Unknown';
        const notificationMessage = `Payment submitted for appointment with ${doctorName} - ${appointment.patient?.firstName} ${appointment.patient?.lastName}`;
        for (const staff of staffUsers) {
            await createNotification(staff.userId, notificationMessage, 'HIGH', 'IN_APP');
            sendToUser(staff.userId, {
                type: 'alert',
                title: 'Appointment Payment Submitted',
                message: notificationMessage,
                data: { appointmentId: appointment.id, action: 'payment_submitted' }
            });
        }

        res.json({ message: 'Payment submitted. Awaiting confirmation.', appointment: updated });
    } catch (error) {
        console.error('Submit Payment Error:', error);
        res.status(500).json({ message: 'Failed to submit payment' });
    }
};

/**
 * Staff confirms payment clearance for an appointment
 * Moves paymentStatus to CLEARED
 */
export const clearAppointmentPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // appointmentId
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const appointment = await prisma.appointment.findUnique({
            where: { id: String(id) },
            include: {
                patient: { select: { userId: true, firstName: true, lastName: true } },
                doctor: { select: { user: { select: { firstName: true, lastName: true } } } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        if (appointment.paymentStatus === 'CLEARED' || appointment.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: `Payment already ${appointment.paymentStatus.toLowerCase()}` });
        }

        const updated = await prisma.appointment.update({
            where: { id: String(id) },
            data: {
                paymentStatus: 'CLEARED',
                clearedAt: new Date(),
                clearedById: staff.id
            }
        });

        // Notify patient
        if (appointment.patient?.userId) {
            const doctorName = appointment.doctor?.user ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : 'your doctor';
            const patientMessage = `Payment cleared for your appointment with ${doctorName}. You may check in.`;
            await createNotification(appointment.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(appointment.patient.userId, {
                type: 'alert',
                title: 'Appointment Payment Cleared',
                message: patientMessage,
                data: { appointmentId: appointment.id, action: 'payment_cleared' }
            });
        }

        res.json({ message: 'Payment cleared successfully', appointment: updated });
    } catch (error) {
        console.error('Clear Payment Error:', error);
        res.status(500).json({ message: 'Failed to clear payment' });
    }
};

/**
 * Admin waives payment for an appointment (emergency override)
 * Moves paymentStatus to WAIVED
 */
export const waiveAppointmentPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // appointmentId
        const { waiverReason } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admin can waive payments' });
        }

        const staff = await prisma.staff.findUnique({ where: { userId } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        const appointment = await prisma.appointment.findUnique({
            where: { id: String(id) },
            include: {
                patient: { select: { userId: true, firstName: true, lastName: true } },
                doctor: { select: { user: { select: { firstName: true, lastName: true } } } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        if (appointment.paymentStatus === 'WAIVED') {
            return res.status(400).json({ message: 'Payment already waived' });
        }

        const updated = await prisma.appointment.update({
            where: { id: String(id) },
            data: {
                paymentStatus: 'WAIVED',
                clearedAt: new Date(),
                clearedById: staff.id,
                waiverReason: waiverReason || 'Emergency waiver'
            }
        });

        // Notify patient
        if (appointment.patient?.userId) {
            const doctorName = appointment.doctor?.user ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : 'your doctor';
            const patientMessage = `Payment waived for your appointment with ${doctorName}. Reason: ${waiverReason || 'Emergency'}`;
            await createNotification(appointment.patient.userId, patientMessage, 'HIGH', 'IN_APP');
            sendToUser(appointment.patient.userId, {
                type: 'alert',
                title: 'Appointment Payment Waived',
                message: patientMessage,
                data: { appointmentId: appointment.id, action: 'payment_waived' }
            });
        }

        res.json({ message: 'Payment waived successfully', appointment: updated });
    } catch (error) {
        console.error('Waive Payment Error:', error);
        res.status(500).json({ message: 'Failed to waive payment' });
    }
};
