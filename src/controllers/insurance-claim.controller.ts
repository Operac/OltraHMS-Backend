import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { randomBytes } from 'crypto';
import { ClaimStatus, PaymentStatus, PaymentMethod, InvoiceStatus } from '@prisma/client';

const generateClaimNumber = (): string => {
    const timestamp = Date.now();
    const random = randomBytes(3).toString('hex');
    return `CLM-${timestamp}-${random}`;
};

/**
 * POST /insurance-claims
 * Create a new insurance claim from an invoice with insurance split
 */
export const createClaim = async (req: AuthRequest, res: Response) => {
    try {
        const { invoiceId, insuranceProvider, notes } = req.body;

        if (!invoiceId) {
            return res.status(400).json({ message: 'invoiceId is required' });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                patientInsurance: true
            }
        });

        if (!invoice) return res.status(400).json({ message: 'Invoice not found' });

        // Check if claim already exists for this invoice
        const existingClaim = await prisma.insuranceClaim.findUnique({
            where: { invoiceId }
        });
        if (existingClaim) {
            return res.status(400).json({ message: 'A claim already exists for this invoice', claim: existingClaim });
        }

        // Use linked PatientInsurance if available, otherwise require manual provider
        const provider = invoice.patientInsurance?.provider || insuranceProvider;
        if (!provider) {
            return res.status(400).json({ message: 'No insurance provider found. Invoice has no linked insurance and no provider was specified.' });
        }

        // Parse invoice items for ClaimItem creation
        const invoiceItems = Array.isArray(invoice.items) ? invoice.items as any[] : [];
        const submittedAmount = invoice.insuranceCoveredAmount || invoice.total;

        const claim = await prisma.$transaction(async (tx) => {
            const newClaim = await tx.insuranceClaim.create({
                data: {
                    invoiceId,
                    claimNumber: generateClaimNumber(),
                    insuranceProvider: provider,
                    submittedAmount,
                    patientId: invoice.patientId,
                    patientInsuranceId: invoice.patientInsuranceId,
                    status: ClaimStatus.DRAFT,
                    claimItems: {
                        create: invoiceItems.map((item: any) => ({
                            description: item.description || 'Service',
                            serviceId: item.serviceId,
                            billedAmount: item.total || item.amount * (item.quantity || 1),
                            coveredAmount: Math.round((item.total || item.amount * (item.quantity || 1)) * ((invoice.patientInsurance?.coveragePercentage || 100) / 100) * 100) / 100,
                            patientPortion: Math.round((item.total || item.amount * (item.quantity || 1)) * (1 - ((invoice.patientInsurance?.coveragePercentage || 100) / 100)) * 100) / 100
                        }))
                    }
                },
                include: {
                    invoice: {
                        include: {
                            patient: { select: { firstName: true, lastName: true, patientNumber: true } }
                        }
                    },
                    claimItems: true,
                    patientInsurance: true
                }
            });

            return newClaim;
        });

        res.status(201).json(claim);
    } catch (error) {
        console.error('Error creating claim:', error);
        res.status(500).json({ message: 'Failed to create insurance claim' });
    }
};

/**
 * GET /insurance-claims
 * List all claims with optional filters
 */
export const getClaims = async (req: AuthRequest, res: Response) => {
    try {
        const { status, provider, startDate, endDate } = req.query;

        const where: any = {};
        if (status) where.status = String(status) as ClaimStatus;
        if (provider) where.insuranceProvider = { contains: String(provider), mode: 'insensitive' };
        if (startDate || endDate) {
            where.submittedAt = {};
            if (startDate) where.submittedAt.gte = new Date(String(startDate));
            if (endDate) where.submittedAt.lte = new Date(String(endDate));
        }

        const claims = await prisma.insuranceClaim.findMany({
            where,
            include: {
                invoice: {
                    include: {
                        patient: { select: { firstName: true, lastName: true, patientNumber: true } }
                    }
                },
                patientInsurance: { select: { provider: true, planName: true, policyNumber: true, coveragePercentage: true } },
                claimItems: true
            },
            orderBy: { submittedAt: 'desc' }
        });

        res.json(claims);
    } catch (error) {
        console.error('Error fetching claims:', error);
        res.status(500).json({ message: 'Failed to fetch insurance claims' });
    }
};

/**
 * GET /insurance-claims/:id
 * Get claim details with items
 */
export const getClaimById = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const claim = await prisma.insuranceClaim.findUnique({
            where: { id },
            include: {
                invoice: {
                    include: {
                        patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                        payments: true
                    }
                },
                patientInsurance: true,
                claimItems: true,
                patient: { select: { firstName: true, lastName: true, patientNumber: true } }
            }
        });

        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        res.json(claim);
    } catch (error) {
        console.error('Error fetching claim:', error);
        res.status(500).json({ message: 'Failed to fetch claim' });
    }
};

/**
 * PATCH /insurance-claims/:id
 * Update claim status, approved amount, denial reason
 */
export const updateClaim = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { status, approvedAmount, denialReason, trackingNumber } = req.body;
        const userId = req.user?.id;

        const existing = await prisma.insuranceClaim.findUnique({
            where: { id },
            include: { invoice: true }
        });
        if (!existing) return res.status(404).json({ message: 'Claim not found' });

        const updateData: any = {};
        if (status) updateData.status = status as ClaimStatus;
        if (approvedAmount !== undefined) updateData.approvedAmount = parseFloat(approvedAmount);
        if (denialReason !== undefined) updateData.denialReason = denialReason;
        if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;

        // When claim is PAID, create Payment record and update invoice
        if (status === 'PAID' && existing.status !== 'PAID') {
            const paidAmount = approvedAmount ? parseFloat(approvedAmount) : existing.submittedAmount;

            await prisma.$transaction(async (tx) => {
                // Update the claim
                await tx.insuranceClaim.update({
                    where: { id },
                    data: updateData
                });

                // Create Payment record for the insurance reimbursement
                await tx.payment.create({
                    data: {
                        invoiceId: existing.invoiceId,
                        amount: paidAmount,
                        method: PaymentMethod.INSURANCE,
                        transactionReference: trackingNumber || existing.claimNumber,
                        status: PaymentStatus.COMPLETED,
                        processedById: userId || 'system'
                    }
                });

                // Update invoice
                const invoice = await tx.invoice.findUnique({ where: { id: existing.invoiceId } });
                if (invoice) {
                    const newAmountPaid = invoice.amountPaid + paidAmount;
                    const newBalance = Math.max(invoice.total - newAmountPaid, 0);
                    const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

                    await tx.invoice.update({
                        where: { id: existing.invoiceId },
                        data: {
                            amountPaid: newAmountPaid,
                            balance: newBalance,
                            status: newStatus
                        }
                    });
                }

                // Update usedAmount on PatientInsurance
                if (existing.patientInsuranceId) {
                    await tx.patientInsurance.update({
                        where: { id: existing.patientInsuranceId },
                        data: {
                            usedAmount: { increment: paidAmount }
                        }
                    });
                }
            });

            const updated = await prisma.insuranceClaim.findUnique({
                where: { id },
                include: {
                    invoice: { include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } } } },
                    claimItems: true,
                    patientInsurance: true
                }
            });

            return res.json(updated);
        }

        // Standard update for non-PAID status changes
        const updated = await prisma.insuranceClaim.update({
            where: { id },
            data: updateData,
            include: {
                invoice: { include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } } } },
                claimItems: true,
                patientInsurance: true
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating claim:', error);
        res.status(500).json({ message: 'Failed to update claim' });
    }
};

/**
 * POST /insurance-claims/:id/submit
 * Mark a DRAFT claim as SUBMITTED
 */
export const submitClaim = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
        if (!claim) return res.status(404).json({ message: 'Claim not found' });
        if (claim.status !== ClaimStatus.DRAFT) {
            return res.status(400).json({ message: `Claim is already ${claim.status}, cannot submit` });
        }

        const updated = await prisma.insuranceClaim.update({
            where: { id },
            data: {
                status: ClaimStatus.SUBMITTED,
                submittedAt: new Date()
            },
            include: {
                invoice: {
                    include: {
                        patient: { select: { firstName: true, lastName: true, patientNumber: true } }
                    }
                },
                claimItems: true,
                patientInsurance: true
            }
        });

        res.json({ message: 'Claim submitted successfully', claim: updated });
    } catch (error) {
        console.error('Error submitting claim:', error);
        res.status(500).json({ message: 'Failed to submit claim' });
    }
};

/**
 * GET /insurance-claims/stats/summary
 * Get claims statistics
 */
export const getClaimStats = async (req: AuthRequest, res: Response) => {
    try {
        const allClaims = await prisma.insuranceClaim.findMany();

        const stats = {
            total: allClaims.length,
            draft: allClaims.filter(c => c.status === ClaimStatus.DRAFT).length,
            submitted: allClaims.filter(c => c.status === ClaimStatus.SUBMITTED).length,
            underReview: allClaims.filter(c => c.status === ClaimStatus.UNDER_REVIEW).length,
            approved: allClaims.filter(c => c.status === ClaimStatus.APPROVED).length,
            partiallyApproved: allClaims.filter(c => c.status === ClaimStatus.PARTIALLY_APPROVED).length,
            rejected: allClaims.filter(c => c.status === ClaimStatus.REJECTED).length,
            paid: allClaims.filter(c => c.status === ClaimStatus.PAID).length,
            totalSubmitted: allClaims.reduce((sum, c) => sum + c.submittedAmount, 0),
            totalApproved: allClaims
                .filter(c => c.approvedAmount != null)
                .reduce((sum, c) => sum + (c.approvedAmount || 0), 0)
        };

        res.json(stats);
    } catch (error) {
        console.error('Error fetching claim stats:', error);
        res.status(500).json({ message: 'Failed to fetch claim statistics' });
    }
};

/**
 * GET /insurance-claims/invoice/:invoiceId
 * Get claim for a specific invoice
 */
export const getClaimByInvoice = async (req: AuthRequest, res: Response) => {
    try {
        const invoiceId = req.params.invoiceId as string;

        const claim = await prisma.insuranceClaim.findUnique({
            where: { invoiceId },
            include: {
                claimItems: true,
                patientInsurance: true,
                invoice: { include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } } } }
            }
        });

        res.json(claim || null);
    } catch (error) {
        console.error('Error fetching claim by invoice:', error);
        res.status(500).json({ message: 'Failed to fetch claim' });
    }
};
