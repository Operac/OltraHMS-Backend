import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { InsuranceStatus } from '@prisma/client';

/**
 * GET /insurance/verification/pending
 * Get all insurance records awaiting verification
 */
export const getPendingVerifications = async (req: AuthRequest, res: Response) => {
    try {
        const policies = await prisma.patientInsurance.findMany({
            where: { status: InsuranceStatus.PENDING },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        phone: true,
                        dateOfBirth: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(policies);
    } catch (error) {
        console.error('Get Pending Verifications Error:', error);
        res.status(500).json({ message: 'Failed to fetch pending verifications' });
    }
};

/**
 * GET /insurance/verification/patient/:patientId
 * Get all insurance records for a specific patient
 */
export const getPatientInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId } = req.params as { patientId: string };

        const policies = await prisma.patientInsurance.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(policies);
    } catch (error) {
        console.error('Get Patient Insurance Error:', error);
        res.status(500).json({ message: 'Failed to fetch patient insurance' });
    }
};

/**
 * POST /insurance/verification/:id/approve
 * Approve a pending insurance policy
 */
export const approveInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { annualLimit, coveragePercentage, coverageDetails, validFrom, validUntil, verificationNote } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const policy = await prisma.patientInsurance.findUnique({ where: { id } });
        if (!policy) return res.status(404).json({ message: 'Insurance policy not found' });

        if (policy.status !== InsuranceStatus.PENDING) {
            return res.status(400).json({ message: `Policy is already ${policy.status}, cannot approve` });
        }

        const updated = await prisma.patientInsurance.update({
            where: { id },
            data: {
                status: InsuranceStatus.ACTIVE,
                verifiedBy: userId,
                verifiedAt: new Date(),
                verificationNote: verificationNote || 'Approved',
                ...(annualLimit !== undefined && { annualLimit: parseFloat(annualLimit) }),
                ...(coveragePercentage !== undefined && { coveragePercentage: parseFloat(coveragePercentage) }),
                ...(coverageDetails !== undefined && { coverageDetails }),
                ...(validFrom && { validFrom: new Date(validFrom) }),
                ...(validUntil && { validUntil: new Date(validUntil) })
            }
        });

        res.json({ message: 'Insurance approved successfully', policy: updated });
    } catch (error) {
        console.error('Approve Insurance Error:', error);
        res.status(500).json({ message: 'Failed to approve insurance' });
    }
};

/**
 * POST /insurance/verification/:id/reject
 * Reject a pending insurance policy
 */
export const rejectInsurance = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { verificationNote } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const policy = await prisma.patientInsurance.findUnique({ where: { id } });
        if (!policy) return res.status(404).json({ message: 'Insurance policy not found' });

        if (policy.status !== InsuranceStatus.PENDING) {
            return res.status(400).json({ message: `Policy is already ${policy.status}, cannot reject` });
        }

        const updated = await prisma.patientInsurance.update({
            where: { id },
            data: {
                status: InsuranceStatus.REJECTED,
                verifiedBy: userId,
                verifiedAt: new Date(),
                verificationNote: verificationNote || 'Rejected'
            }
        });

        res.json({ message: 'Insurance rejected', policy: updated });
    } catch (error) {
        console.error('Reject Insurance Error:', error);
        res.status(500).json({ message: 'Failed to reject insurance' });
    }
};

/**
 * GET /insurance/verification/stats
 * Get verification statistics
 */
export const getVerificationStats = async (req: AuthRequest, res: Response) => {
    try {
        const [pending, active, rejected, expired] = await Promise.all([
            prisma.patientInsurance.count({ where: { status: InsuranceStatus.PENDING } }),
            prisma.patientInsurance.count({ where: { status: InsuranceStatus.ACTIVE } }),
            prisma.patientInsurance.count({ where: { status: InsuranceStatus.REJECTED } }),
            prisma.patientInsurance.count({ where: { status: InsuranceStatus.EXPIRED } })
        ]);

        res.json({ pending, active, rejected, expired, total: pending + active + rejected + expired });
    } catch (error) {
        console.error('Get Verification Stats Error:', error);
        res.status(500).json({ message: 'Failed to fetch verification stats' });
    }
};

/**
 * GET /insurance/providers
 * Get distinct list of HMO providers from existing policies
 */
export const getInsuranceProviders = async (req: AuthRequest, res: Response) => {
    try {
        const policies = await prisma.patientInsurance.findMany({
            select: { provider: true },
            distinct: ['provider'],
            orderBy: { provider: 'asc' }
        });

        const providers = policies.map(p => p.provider);
        res.json(providers);
    } catch (error) {
        console.error('Get Insurance Providers Error:', error);
        res.status(500).json({ message: 'Failed to fetch providers' });
    }
};
