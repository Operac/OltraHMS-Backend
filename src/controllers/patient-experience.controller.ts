import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppointmentStatus, PrescriptionStatus, Role } from '@prisma/client';
import { generateJitsiToken, generateRoomName, getJitsiConfig } from '../services/jitsi.service';

// Helper to get patient context
const getPatientContext = async (userId: string) => {
    const patient = await prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new Error('Patient profile not found');
    return patient;
};

// --- Medical Records ---

export const getMedicalRecords = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        const records = await prisma.medicalRecord.findMany({
            where: { patientId: patient.id },
            include: {
                doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
                prescriptions: true,
                labOrders: true
            },
            orderBy: { visitDate: 'desc' }
        });
        
        // Also fetch Allergies and Conditions from Patient profile
        // In a real app, these might be aggregated or stored in separate tables
        const profileData = {
            allergies: patient.allergies,
            chronicConditions: patient.chronicConditions,
            bloodGroup: patient.bloodGroup,
            genotype: patient.genotype
        };

        res.json({ profile: profileData, history: records });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch records' });
    }
};

export const getLabResults = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        const labs = await prisma.labOrder.findMany({
            where: { patientId: patient.id },
            include: {
                result: true,
                medicalRecord: { select: { visitDate: true } }
            },
            orderBy: { orderedAt: 'desc' }
        });
        res.json(labs);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch labs' });
    }
};

export const getPrescriptions = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        const prescriptions = await prisma.prescription.findMany({
            where: { patientId: patient.id },
            include: {
                medicalRecord: { include: { doctor: { include: { user: { select: { firstName: true, lastName: true } } } } } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(prescriptions);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch prescriptions' });
    }
};

export const requestRefill = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { prescriptionId } = req.body;
        
        // Check if prescription allows refills
        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId, patientId: patient.id }
        });
        
        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });
        if (prescription.refills <= 0) return res.status(400).json({ message: 'No refills remaining' });
        
        // Find the prescribing doctor or default to any pharmacist
        let targetStaff = await prisma.staff.findFirst({ 
            where: { medicalRecords: { some: { id: prescription.medicalRecordId } } } 
        });
        
        // If no prescribing doctor found, find a pharmacist
        if (!targetStaff) {
            targetStaff = await prisma.staff.findFirst({ 
                where: { user: { role: Role.PHARMACIST } },
                orderBy: { createdAt: 'asc' }
            });
        }
        
        // Only create notification if we found a valid staff member
        if (targetStaff) {
            await prisma.notification.create({
                data: {
                    userId: targetStaff.userId,
                    message: `Refill requested for ${prescription.medicationName} by ${patient.firstName} ${patient.lastName}`,
                    channel: "IN_APP",
                    priority: "MEDIUM",
                    status: "PENDING"
                }
            });
        }

        res.json({ message: 'Refill request submitted' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to request refill' });
    }
};

// --- Billing ---

export const getInvoices = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        const invoices = await prisma.invoice.findMany({
            where: { patientId: patient.id },
            include: { payments: true, insuranceClaim: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(invoices);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch invoices' });
    }
};

// --- Wellness ---

export const getWellnessGoals = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        const goals = await prisma.wellnessGoal.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(goals);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch wellness goals' });
    }
};

export const updateWellnessGoal = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { description, targetDate, status, id } = req.body;
        
        if (id) {
            const updated = await prisma.wellnessGoal.update({
                where: { id: String(id), patientId: patient.id },
                data: { 
                    description: String(description), 
                    targetDate: targetDate ? new Date(targetDate) : null, 
                    status: status ? String(status) : undefined 
                }
            });
            return res.json(updated);
        } else {
            const created = await prisma.wellnessGoal.create({
                data: {
                    patientId: patient.id,
                    description: String(description),
                    category: 'GENERAL', // default
                    frequency: 'DAILY', // default
                    targetValue: 1, // default
                    unit: 'count', // default
                    currentValue: 0,
                    streak: 0,
                    targetDate: targetDate ? new Date(targetDate) : null,
                    status: status ? String(status) : 'IN_PROGRESS'
                }
            });
            return res.status(201).json(created);
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to update wellness goal' });
    }
};

// --- Feedback ---

export const submitFeedback = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { rating, comment, doctorId, category } = req.body;
        
        const feedback = await prisma.feedback.create({
            data: {
                patientId: patient.id,
                doctorId,
                rating,
                comment,
                category
            }
        });
        res.status(201).json(feedback);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to submit feedback' });
    }
};

// --- Existing Controllers (Updated) ---

export const getInsurancePolicies = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const policies = await prisma.patientInsurance.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(policies);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch insurance' });
    }
};

export const addInsurancePolicy = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { provider, policyNumber, planName, isPrimary, validFrom, validUntil, coverageDetails } = req.body;
        
        const policy = await prisma.patientInsurance.create({
            data: {
                patientId: patient.id,
                provider,
                policyNumber,
                planName: planName || 'Standard',
                isPrimary: isPrimary || false,
                status: 'PENDING',
                validFrom: validFrom ? new Date(validFrom) : null,
                validUntil: validUntil ? new Date(validUntil) : null,
                coverageDetails
            }
        });
        res.status(201).json(policy);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to add insurance' });
    }
};

// Verify insurance (admin/reception)
export const verifyInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const insuranceId = req.params.insuranceId as string;
        const { status, verificationNote } = req.body;
        const userId = req.user?.id;
        
        if (!insuranceId) {
            return res.status(400).json({ message: 'Insurance ID is required' });
        }
        
        const policy = await prisma.patientInsurance.update({
            where: { id: insuranceId },
            data: {
                status,
                verificationNote,
                verifiedBy: userId,
                verifiedAt: new Date()
            }
        });
        
        res.json(policy);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to verify insurance' });
    }
};

export const getMedicationAdherence = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Get patient's wellness medications
        const medications = await prisma.wellnessMedication.findMany({
            where: { patientId: patient.id, status: 'ACTIVE' },
            select: { id: true }
        });
        const medicationIds = medications.map(m => m.id);

        const logs = await prisma.medicationLog.findMany({
            where: { 
                medicationId: { in: medicationIds },
                takenAt: { gte: sevenDaysAgo }
            },
            include: { 
                medication: { select: { name: true, dosage: true, frequency: true } } 
            },
            orderBy: { takenAt: 'desc' }
        });
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch adherence logs' });
    }
};

export const logMedicationTaken = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { medicationId, status, notes } = req.body;

        // Verify the medication belongs to this patient
        const medication = await prisma.wellnessMedication.findFirst({
            where: { id: medicationId, patientId: patient.id }
        });

        if (!medication) {
            return res.status(404).json({ message: 'Medication not found' });
        }

        const log = await prisma.medicationLog.create({
            data: {
                medicationId: medicationId,
                status: status || 'TAKEN',
                takenAt: status === 'TAKEN' ? new Date() : null,
                notes: notes || null,
                scheduledTime: new Date() // Default to current time
            }
        });
        res.status(201).json(log);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to log medication' });
    }
};

export const rescheduleAppointment = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { id } = req.params as { id: string };
        const { newDate } = req.body;

        const appointment = await prisma.appointment.findFirst({
            where: { id, patientId: patient.id }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        const updated = await prisma.appointment.update({
            where: { id },
            data: {
                appointmentDate: new Date(newDate),
                startTime: new Date(newDate), // Assuming reschedule implies start time change too? Or separate time logic
                // Ideally reschedule needs time too. Assuming newDate handles both.
                status: AppointmentStatus.REQUESTED,
                notes: appointment.notes ? `${appointment.notes}\nRescheduled by patient.` : 'Rescheduled by patient.'
            }
        });

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to reschedule' });
    }
};

export const cancelAppointment = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { id } = req.params as { id: string };
        const { reason } = req.body;

        const updated = await prisma.appointment.updateMany({
            where: { id, patientId: patient.id },
            data: {
                status: AppointmentStatus.CANCELLED,
                notes: reason ? `Cancelled by patient: ${reason}` : 'Cancelled by patient'
            }
        });

        if (updated.count === 0) return res.status(404).json({ message: 'Appointment not found' });
        res.json({ message: 'Appointment cancelled' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to cancel' });
    }
};

export const getDependents = async (req: AuthRequest, res: Response) => {
    try {
         const patient = await getPatientContext(req.user!.id);
         const fullPatient = await prisma.patient.findUnique({ 
             where: { id: patient.id },
             include: { dependents: true } 
         });
         
         res.json(fullPatient?.dependents || []);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch dependents' });
    }
};

export const addDependent = async (req: AuthRequest, res: Response) => {
    try {
        const guardian = await getPatientContext(req.user!.id);
        const { firstName, lastName, dateOfBirth, gender, relation } = req.body;
        
        const guardianUser = await prisma.user.findUnique({ where: { id: req.user!.id } });
        const dependentEmail = `${guardianUser?.email?.split('@')[0]}+${firstName.toLowerCase()}.${Date.now()}@${guardianUser?.email?.split('@')[1]}`;
        
        const dependentUser = await prisma.user.create({
            data: {
                email: dependentEmail,
                passwordHash: "MANAGED_ACCOUNT", 
                role: "PATIENT", 
                firstName,
                lastName,
                status: "ACTIVE"
            }
        });

        const dependent = await prisma.patient.create({
            data: {
                userId: dependentUser.id,
                firstName,
                lastName,
                dateOfBirth: new Date(dateOfBirth),
                gender,
                patientNumber: `DEP-${Date.now()}`,
                phone: guardian.phone,
                guardianId: guardian.id,
                emergencyContact: { relation }
            }
        });

        res.status(201).json(dependent);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to add dependent' });
    }
};

// --- Notifications ---

export const getNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user!.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(notifications);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch notifications' });
    }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const notification = await prisma.notification.updateMany({
            where: { id, userId: req.user!.id },
            data: { status: 'READ', readAt: new Date() }
        });
        res.json({ message: 'Marked as read' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to update notification' });
    }
};

// --- Telemedicine & Queue ---

export const getQueueStatus = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        
        // Find today's appointment
        const today = new Date();
        const startOfDay = new Date(today.setHours(0,0,0,0));
        const endOfDay = new Date(today.setHours(23,59,59,999));
        
        const appointment = await prisma.appointment.findFirst({
            where: { 
                patientId: patient.id,
                startTime: { gte: startOfDay, lte: endOfDay },
                status: { in: ['CONFIRMED', 'CHECKED_IN'] }
            }
        });

        if (!appointment) return res.json({ message: 'No active appointment today', position: null });

        // Calculate position: Count CHECKED_IN appointments before this one for the same doctor
        const position = await prisma.appointment.count({
            where: {
                doctorId: appointment.doctorId,
                status: 'CHECKED_IN',
                startTime: { lt: appointment.startTime }
            }
        });

        res.json({ 
            appointmentId: appointment.id,
            status: appointment.status,
            queuePosition: position + 1,
            estimatedWaitTime: (position + 1) * 15 // Mock 15 mins per patient
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to get queue status' });
    }
};

export const getEmergencyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        // Expose only critical info
        const profile = {
            firstName: patient.firstName,
            lastName: patient.lastName,
            bloodGroup: patient.bloodGroup,
            genotype: patient.genotype,
            allergies: patient.allergies,
            chronicConditions: patient.chronicConditions,
            emergencyContact: patient.emergencyContact,
            medications: await prisma.prescription.findMany({
                where: { patientId: patient.id, status: 'PENDING' }, // Active meds
                select: { medicationName: true, dosage: true, frequency: true }
            })
        };
        res.json(profile);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to get emergency profile' });
    }
};

// --- Telemedicine ---

export const initializeVideoSession = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { appointmentId } = req.body;

        const appointment = await prisma.appointment.findFirst({
            where: { id: appointmentId, patientId: patient.id }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        
        // Check if session already exists
        let session = await prisma.videoSession.findUnique({
             where: { appointmentId }
        });

        if (!session) {
            // Generate unique room name for Jitsi
            const roomName = generateRoomName(appointmentId);
            
            session = await prisma.videoSession.create({
                data: {
                    appointmentId,
                    roomId: roomName,
                    status: 'ACTIVE'
                }
            });
        }

        // Get Jitsi configuration
        const jitsiConfig = getJitsiConfig();
        const jitsiToken = jitsiConfig.useToken 
            ? generateJitsiToken(session.roomId, patient.firstName || 'Patient', false)
            : null;

        res.json({
            sessionId: session.id,
            roomId: session.roomId,
            jitsiUrl: jitsiConfig.url,
            token: jitsiToken?.token || null,
            provider: "Jitsi",
            useToken: jitsiConfig.useToken
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to init video session' });
    }
};

// --- Payments ---

export const processPayment = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { invoiceId, amount, method, reference } = req.body; // method: 'CARD', 'MOBILE_MONEY'

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.patientId !== patient.id) return res.status(403).json({ message: 'Unauthorized' });

        const isVerified = true; 

        if (isVerified) {
            // Record Payment
            const payment = await prisma.payment.create({
                data: {
                    invoiceId,
                    amount: parseFloat(amount),
                    method,
                    transactionReference: reference || `REF-${Date.now()}`,
                    status: 'COMPLETED',
                    processedById: req.user!.id // Self-processed via Portal
                }
            });

            // Update Invoice Status
            const newPaid = invoice.amountPaid + parseFloat(amount);
            const newBalance = invoice.total - newPaid;
            let newStatus = invoice.status;
            
            if (newBalance <= 0) newStatus = 'PAID';
            else if (newPaid > 0) newStatus = 'PARTIAL';

            await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    amountPaid: newPaid,
                    balance: newBalance,
                    status: newStatus
                }
            });

            res.json({ message: 'Payment successful', payment });
        } else {
            res.status(400).json({ message: 'Payment verification failed' });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to process payment' });
    }
};


