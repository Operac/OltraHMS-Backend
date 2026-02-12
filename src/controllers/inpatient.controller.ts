import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { BedStatus } from '@prisma/client';

/**
 * Get All Wards with Bed Statistics
 */
export const getAllWards = async (req: AuthRequest, res: Response) => {
    try {
        const wards = await prisma.ward.findMany({
            include: {
                beds: {
                    select: { status: true }
                }
            }
        });

        // Calculate stats
        const wardStats = wards.map(ward => {
            const total = ward.beds.length;
            const occupied = ward.beds.filter(b => b.status === 'OCCUPIED').length;
            const available = ward.beds.filter(b => b.status === 'VACANT_CLEAN').length;
            const dirty = ward.beds.filter(b => b.status === 'VACANT_DIRTY').length;
            
            return {
                ...ward,
                stats: { total, occupied, available, dirty },
                beds: undefined // Don't send all beds in list view
            };
        });

        res.json(wardStats);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch wards' });
    }
};

/**
 * Get Ward Details (Beds + Patients)
 */
export const getWardDetails = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const ward = await prisma.ward.findUnique({
            where: { id },
            include: {
                beds: {
                    orderBy: { number: 'asc' },
                    include: {
                        currAdmission: {
                            where: { status: 'ADMITTED' },
                            include: {
                                patient: {
                                    select: { firstName: true, lastName: true, patientNumber: true, gender: true, dateOfBirth: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!ward) return res.status(404).json({ message: 'Ward not found' });
        res.json(ward);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch ward details' });
    }
};

/**
 * Admit Patient to a Bed
 */
export const admitPatient = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, bedId, reason, estimatedDischargeDate } = req.body;

        // Validation
        const bed = await prisma.bed.findUnique({ where: { id: bedId } });
        if (!bed) return res.status(404).json({ message: 'Bed not found' });
        if (bed.status !== 'VACANT_CLEAN') return res.status(400).json({ message: 'Bed is not available' });

        const existingAdmission = await prisma.admission.findFirst({
            where: { patientId, status: 'ADMITTED' }
        });
        if (existingAdmission) return res.status(400).json({ message: 'Patient is already admitted' });

        // Transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Admission
            const admission = await tx.admission.create({
                data: {
                    patientId,
                    bedId,
                    reason,
                    estimatedDischargeDate: estimatedDischargeDate ? new Date(estimatedDischargeDate) : null,
                    status: 'ADMITTED',
                    admittedById: req.user!.id
                }
            });

            // 2. Update Bed Status
            await tx.bed.update({
                where: { id: bedId },
                data: { status: 'OCCUPIED' }
            });

            return admission;
        });

        res.status(201).json(result);
    } catch (error) {
        console.error("Admit Error", error);
        res.status(500).json({ message: 'Failed to admit patient' });
    }
};

/**
 * Discharge Patient
 */
export const dischargePatient = async (req: AuthRequest, res: Response) => {
    try {
        const { admissionId } = req.body;

        const admission = await prisma.admission.findUnique({ where: { id: admissionId } });
        if (!admission) return res.status(404).json({ message: 'Admission not found' });
        if (admission.status !== 'ADMITTED') return res.status(400).json({ message: 'Patient already discharged' });

        const result = await prisma.$transaction(async (tx) => {
            // 1. Update Admission
            const updatedAdmission = await tx.admission.update({
                where: { id: admissionId },
                data: {
                    status: 'DISCHARGED',
                    dischargeDate: new Date()
                }
            });

            // 2. Update Bed Status (Dirty needs cleaning)
            await tx.bed.update({
                where: { id: admission.bedId },
                data: { status: 'VACANT_DIRTY' }
            });

            return updatedAdmission;
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Failed to discharge patient' });
    }
};

/**
 * Update Bed Status (e.g., Clean a dirty bed)
 */
export const updateBedStatus = async (req: AuthRequest, res: Response) => {
    try {
        const bedId = String(req.params.bedId);
        const { status } = req.body; // Expect 'VACANT_CLEAN' usually

        const bed = await prisma.bed.update({
            where: { id: bedId },
            data: { status: status as BedStatus }
        });

        res.json(bed);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update bed status' });
    }
};
