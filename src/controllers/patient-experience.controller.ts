import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppointmentStatus, PrescriptionStatus, Role } from '@prisma/client';
import { generateJitsiToken, generateRoomName, getJitsiConfig } from '../services/jitsi.service';
import { createNotification } from './notification.controller';
import { z } from 'zod';

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
                labOrders: {
                    include: {
                        result: true
                    }
                }
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
        res.status(500).json({ message: 'Failed to fetch records' });
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
        res.status(500).json({ message: 'Failed to fetch labs' });
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
        res.status(500).json({ message: 'Failed to fetch prescriptions' });
    }
};

export const requestRefill = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const routePrescriptionId = req.params.prescriptionId;
        const prescriptionId = (Array.isArray(routePrescriptionId) ? routePrescriptionId[0] : routePrescriptionId) ?? req.body.prescriptionId;

        if (!prescriptionId) {
            return res.status(400).json({ message: 'Prescription ID is required' });
        }
        
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
        res.status(500).json({ message: 'Failed to request refill' });
    }
};

// Approve refill request (pharmacist)
export const approveRefill = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptionId = req.params.prescriptionId as string;
        const pharmacist = await prisma.staff.findUnique({ 
            where: { userId: req.user!.id },
            include: { user: { select: { role: true } } }
        });
        
        if (!pharmacist || pharmacist.user.role !== Role.PHARMACIST) {
            return res.status(403).json({ message: 'Only pharmacists can approve refills' });
        }
        
        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId }
        });
        
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        
        if (prescription.status !== 'REFILL_REQUESTED') {
            return res.status(400).json({ 
                message: `Prescription is not in refill requested status. Current status: ${prescription.status}` 
            });
        }
        
        // Update prescription back to dispensed status (ready for dispensing)
        const updatedPrescription = await prisma.prescription.update({
            where: { id: prescriptionId },
            data: { 
                status: 'DISPENSED',
                refills: prescription.refills // Refills already decremented when requested
            }
        });
        
        // Delete the refill request
        await prisma.refillRequest.deleteMany({
            where: { prescriptionId }
        });
        
        // Notify patient
        const patient = await prisma.patient.findUnique({
            where: { id: prescription.patientId }
        });
        
        if (patient && patient.userId) {
            await createNotification(
                patient.userId,
                `Your refill request for ${prescription.medicationName} has been approved and is ready for pickup`,
                'MEDIUM',
                'IN_APP'
            );
        }
        
        res.json({ message: 'Refill approved successfully', prescription: updatedPrescription });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to approve refill' });
    }
};

// Deny refill request (pharmacist)
export const denyRefill = async (req: AuthRequest, res: Response) => {
    try {
        const prescriptionId = req.params.prescriptionId as string;
        const pharmacist = await prisma.staff.findUnique({ 
            where: { userId: req.user!.id },
            include: { user: { select: { role: true } } }
        });
        
        if (!pharmacist || pharmacist.user.role !== Role.PHARMACIST) {
            return res.status(403).json({ message: 'Only pharmacists can deny refills' });
        }
        
        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId }
        });
        
        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }
        
        if (prescription.status !== 'REFILL_REQUESTED') {
            return res.status(400).json({ 
                message: `Prescription is not in refill requested status. Current status: ${prescription.status}` 
            });
        }
        
        // Update prescription back to dispensed status (ready for dispensing)
        const updatedPrescription = await prisma.prescription.update({
            where: { id: prescriptionId },
            data: { 
                status: 'DISPENSED',
                refills: prescription.refills + 1 // Return the refill that was deducted
            }
        });
        
        // Delete the refill request
        await prisma.refillRequest.deleteMany({
            where: { prescriptionId }
        });
        
        // Notify patient
        const patient = await prisma.patient.findUnique({
            where: { id: prescription.patientId }
        });
        
        if (patient && patient.userId) {
            await createNotification(
                patient.userId,
                `Your refill request for ${prescription.medicationName} has been denied. Please contact your doctor for a new prescription.`,
                'MEDIUM',
                'IN_APP'
            );
        }
        
        res.json({ message: 'Refill denied successfully', prescription: updatedPrescription });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to deny refill' });
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
        res.status(500).json({ message: 'Failed to fetch invoices' });
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
        res.status(500).json({ message: 'Failed to fetch wellness goals' });
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
        res.status(500).json({ message: 'Failed to update wellness goal' });
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
        res.status(500).json({ message: 'Failed to submit feedback' });
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
        res.status(500).json({ message: 'Failed to fetch insurance' });
    }
};

export const addInsurancePolicy = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const { provider, policyNumber, planName, isPrimary, validFrom, validUntil, coverageDetails, groupNumber, coveragePercentage } = req.body;
        
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
                coverageDetails,
                groupNumber: groupNumber || null,
                coveragePercentage: coveragePercentage || 100
            }
        });
        res.status(201).json(policy);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to add insurance' });
    }
};

// Get all patient insurance (for admin/receptionist/accountant)
export const getAllPatientInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, status } = req.query;
        
        const where: any = {};
        if (patientId) where.patientId = patientId as string;
        if (status) where.status = status;
        
        const policies = await prisma.patientInsurance.findMany({
            where,
            include: {
                patient: {
                    include: {
                        user: { select: { firstName: true, lastName: true, email: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json(policies);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to fetch insurance policies' });
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
        res.status(500).json({ message: 'Failed to verify insurance' });
    }
};

// Update insurance policy (patient can edit their own, only if PENDING status)
export const updateInsurancePolicy = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const insuranceId = req.params.id as string;
        const { provider, policyNumber, planName, groupNumber, coveragePercentage, validFrom, validUntil, coverageDetails } = req.body;

        if (!insuranceId) {
            return res.status(400).json({ message: 'Insurance ID is required' });
        }

        // Verify the policy belongs to this patient
        const existing = await prisma.patientInsurance.findUnique({ where: { id: insuranceId } });
        if (!existing) return res.status(404).json({ message: 'Insurance policy not found' });
        if (existing.patientId !== patient.id) return res.status(403).json({ message: 'Unauthorized' });

        // Patients can only edit PENDING or REJECTED policies (not ACTIVE — that requires admin re-verification)
        if (existing.status === 'ACTIVE' || existing.status === 'VERIFIED') {
            return res.status(400).json({ message: 'Cannot edit an active/verified policy. Contact support to update.' });
        }

        const updated = await prisma.patientInsurance.update({
            where: { id: insuranceId },
            data: {
                ...(provider && { provider }),
                ...(policyNumber && { policyNumber }),
                ...(planName !== undefined && { planName }),
                ...(groupNumber !== undefined && { groupNumber }),
                ...(coveragePercentage !== undefined && { coveragePercentage: parseFloat(String(coveragePercentage)) }),
                ...(validFrom && { validFrom: new Date(validFrom) }),
                ...(validUntil && { validUntil: new Date(validUntil) }),
                ...(coverageDetails !== undefined && { coverageDetails }),
                // Reset to PENDING if was rejected — patient resubmitted
                ...(existing.status === 'REJECTED' && { status: 'PENDING', verificationNote: null, verifiedBy: null, verifiedAt: null })
            }
        });

        res.json(updated);
    } catch (error: any) {
        console.error('Update Insurance Error:', error);
        res.status(500).json({ message: 'Failed to update insurance policy' });
    }
};

// Delete insurance policy (patient can delete their own if PENDING or REJECTED)
export const deleteInsurancePolicy = async (req: AuthRequest, res: Response) => {
    try {
        const patient = await getPatientContext(req.user!.id);
        const insuranceId = req.params.id as string;

        if (!insuranceId) {
            return res.status(400).json({ message: 'Insurance ID is required' });
        }

        // Verify the policy belongs to this patient
        const existing = await prisma.patientInsurance.findUnique({ where: { id: insuranceId } });
        if (!existing) return res.status(404).json({ message: 'Insurance policy not found' });
        if (existing.patientId !== patient.id) return res.status(403).json({ message: 'Unauthorized' });

        // Don't allow deleting active policies with claims
        if (existing.status === 'ACTIVE' || existing.status === 'VERIFIED') {
            const activeClaims = await prisma.insuranceClaim.count({
                where: { patientInsuranceId: insuranceId, status: { notIn: ['PAID', 'REJECTED'] } }
            });
            if (activeClaims > 0) {
                return res.status(400).json({ message: 'Cannot delete policy with active claims. Contact support.' });
            }
        }

        await prisma.patientInsurance.delete({ where: { id: insuranceId } });

        res.json({ message: 'Insurance policy deleted successfully' });
    } catch (error: any) {
        console.error('Delete Insurance Error:', error);
        res.status(500).json({ message: 'Failed to delete insurance policy' });
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
        res.status(500).json({ message: 'Failed to fetch adherence logs' });
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
        res.status(500).json({ message: 'Failed to log medication' });
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
        res.status(500).json({ message: 'Failed to reschedule' });
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
        res.status(500).json({ message: 'Failed to cancel' });
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
        res.status(500).json({ message: 'Failed to fetch dependents' });
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
        res.status(500).json({ message: 'Failed to add dependent' });
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
        res.status(500).json({ message: 'Failed to fetch notifications' });
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
        res.status(500).json({ message: 'Failed to update notification' });
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
        res.status(500).json({ message: 'Failed to get queue status' });
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
        res.status(500).json({ message: 'Failed to get emergency profile' });
    }
};

const emergencyProfileSchema = z.object({
    emergencyContactName: z.string().trim().max(100).optional().default(''),
    emergencyContactPhone: z.string().trim().max(20).optional().default(''),
    emergencyContactRelationship: z.string().trim().max(60).optional(),
    allergies: z.union([z.string(), z.array(z.string())]).optional(),
    bloodGroup: z.string().trim().optional(),
    genotype: z.string().trim().optional(),
});

const bloodGroupMap: Record<string, string> = {
    'A+': 'A_POSITIVE', 'A-': 'A_NEGATIVE',
    'B+': 'B_POSITIVE', 'B-': 'B_NEGATIVE',
    'AB+': 'AB_POSITIVE', 'AB-': 'AB_NEGATIVE',
    'O+': 'O_POSITIVE', 'O-': 'O_NEGATIVE',
};

export const updateEmergencyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const data = emergencyProfileSchema.parse(req.body);
        const patient = await getPatientContext(req.user!.id);
        const currentContact = patient.emergencyContact && typeof patient.emergencyContact === 'object'
            ? patient.emergencyContact as Record<string, unknown>
            : {};
        const allergies = Array.isArray(data.allergies)
            ? data.allergies.map((value) => value.trim()).filter(Boolean)
            : (data.allergies || '').split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
        const normalizedBloodGroup = data.bloodGroup
            ? bloodGroupMap[data.bloodGroup.toUpperCase()] || data.bloodGroup.toUpperCase()
            : undefined;
        const validBloodGroups = new Set(['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE']);
        const normalizedGenotype = data.genotype?.toUpperCase();
        const validGenotypes = new Set(['AA', 'AS', 'SS', 'AC', 'SC']);

        const updated = await prisma.patient.update({
            where: { id: patient.id },
            data: {
                emergencyContact: {
                    ...currentContact,
                    name: data.emergencyContactName,
                    phone: data.emergencyContactPhone,
                    relationship: data.emergencyContactRelationship ?? currentContact.relationship ?? '',
                },
                allergies,
                bloodGroup: normalizedBloodGroup && validBloodGroups.has(normalizedBloodGroup) ? normalizedBloodGroup as any : undefined,
                genotype: normalizedGenotype && validGenotypes.has(normalizedGenotype) ? normalizedGenotype as any : undefined,
            },
            select: { emergencyContact: true, allergies: true, bloodGroup: true, genotype: true },
        });

        res.json({ message: 'Emergency profile updated successfully', ...updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid emergency profile', errors: error.flatten().fieldErrors });
        }
        console.error('Update Emergency Profile Error:', error);
        res.status(500).json({ message: 'Failed to update emergency profile' });
    }
};

export const removeDependent = async (req: AuthRequest, res: Response) => {
    try {
        const guardian = await getPatientContext(req.user!.id);
        const { id } = req.params as { id: string };

        const removed = await prisma.patient.updateMany({
            where: { id, guardianId: guardian.id },
            data: { guardianId: null },
        });

        if (removed.count === 0) {
            return res.status(404).json({ message: 'Dependent not found' });
        }

        res.json({ message: 'Dependent removed successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to remove dependent' });
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
        res.status(500).json({ message: 'Failed to init video session' });
    }
};

