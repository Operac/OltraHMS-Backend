
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { startOfDay, endOfDay, addDays } from 'date-fns';
import { generateInvoiceNumber } from '../lib/invoice.helper';

/**
 * Get all Operating Theaters
 */
export const getTheaters = async (req: AuthRequest, res: Response) => {
    try {
        const theaters = await prisma.operatingTheater.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(theaters);
    } catch (error) {
        console.error('Error fetching theaters:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Schedule a Surgery Case
 */
export const scheduleSurgery = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, leadSurgeonId, theaterId, procedureServiceId, scheduledStart, scheduledEnd, priority, notes, preOpDiagnosis } = req.body;

        const procedure = await prisma.service.findFirst({
            where: { id: procedureServiceId, type: 'PROCEDURE', isExternal: false }
        });
        if (!procedure || procedure.price <= 0) {
            return res.status(400).json({ message: 'Select a configured hospital procedure with a positive price' });
        }

        // Scheduling creates the payable invoice; clearance is enforced when
        // the procedure moves to IN_PROGRESS.
        // Basic Conflict Check
        const start = new Date(scheduledStart);
        const end = new Date(scheduledEnd);

        // Check theater availability
        const theaterConflict = await prisma.surgeryCase.findFirst({
            where: {
                theaterId,
                status: { not: 'CANCELLED' },
                OR: [
                    {
                        scheduledStart: { lt: end },
                        scheduledEnd: { gt: start }
                    }
                ]
            }
        });

        if (theaterConflict) {
            return res.status(409).json({ message: 'Theater is already booked for this time slot.' });
        }
        
        // Check surgeon availability
        const surgeonConflict = await prisma.surgeryCase.findFirst({
            where: {
                leadSurgeonId,
                status: { not: 'CANCELLED' },
                OR: [
                    {
                        scheduledStart: { lt: end },
                        scheduledEnd: { gt: start }
                    }
                ]
            }
        });
        
        if (surgeonConflict) {
            return res.status(409).json({ message: 'Lead surgeon is not available at this time. They may have another surgery scheduled.' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const surgery = await tx.surgeryCase.create({
                data: {
                    patientId,
                    leadSurgeonId,
                    theaterId,
                    procedureServiceId: procedure.id,
                    scheduledStart: start,
                    scheduledEnd: end,
                    priority: priority || 'ELECTIVE',
                    notes,
                    preOpDiagnosis,
                    status: 'SCHEDULED'
                },
                include: {
                    patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                    theater: true,
                    procedureService: true,
                    leadSurgeon: { select: { user: { select: { firstName: true, lastName: true } } } }
                }
            });

        const invoice = await tx.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber('INV-SURG'),
                patientId,
                surgeryCaseId: surgery.id,
                status: 'ISSUED',
                items: [{ itemType: 'SURGERY', itemId: surgery.id, description: procedure.name, quantity: 1, unitPrice: procedure.price, total: procedure.price }],
                subtotal: procedure.price,
                tax: 0,
                total: procedure.price,
                balance: procedure.price,
            }
        });
            return { ...surgery, invoice };
        });

        res.status(201).json(result);
    } catch (error) {
        console.error('Error scheduling surgery:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Get Surgery Schedule (Calendar View)
 */
export const getSchedule = async (req: AuthRequest, res: Response) => {
    try {
        const { date, theaterId } = req.query;
        
        const where: any = { status: { not: 'CANCELLED' } };
        
        if (date) {
            const dayStart = startOfDay(new Date(String(date)));
            const dayEnd = endOfDay(new Date(String(date)));
            
            where.scheduledStart = {
                gte: dayStart,
                lte: dayEnd
            };
        }

        if (theaterId) where.theaterId = String(theaterId);

        const surgeries = await prisma.surgeryCase.findMany({
            where,
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true, gender: true, dateOfBirth: true } },
                theater: true,
                leadSurgeon: { select: { user: { select: { firstName: true, lastName: true } } } }
            },
            orderBy: { scheduledStart: 'asc' }
        });

        res.json(surgeries);
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Update Surgery Status
 */
export const updateStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, postOpDiagnosis, notes } = req.body;

        if (status === 'IN_PROGRESS') {
            const existing = await prisma.surgeryCase.findUnique({ where: { id: String(id) } });
            if (!existing) return res.status(404).json({ message: 'Surgery case not found' });
            if (existing.paymentStatus !== 'CLEARED' && existing.paymentStatus !== 'WAIVED') {
                if (existing.priority === 'EMERGENCY') {
                    await prisma.surgeryCase.update({
                        where: { id: String(id) },
                        data: { paymentStatus: 'WAIVED', clearedAt: new Date(), waiverReason: 'Emergency procedure bypass' }
                    });
                } else {
                    return res.status(402).json({ message: 'Payment must be cleared before surgery starts', paymentStatus: existing.paymentStatus });
                }
            }
        }

        const updateData: any = { status };
        if (postOpDiagnosis) updateData.postOpDiagnosis = postOpDiagnosis;
        if (notes) updateData.notes = notes;

        const surgery = await prisma.surgeryCase.update({
            where: { id: String(id) },
            data: updateData
        });

        // Loophole: If moving to IN_PROGRESS, ideally check if theater is currently occupied again?
        // For strictness, yes. But assuming scheduled time is respected or manual override allowed.
        // We'll update theater status as well if needed. Not enforcing theater status lock in this MVP iteration.

        res.json(surgery);
    } catch (error) {
        console.error('Error updating surgery status:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Create Operating Theater (Admin)
 */
export const createTheater = async (req: AuthRequest, res: Response) => {
    try {
        const { name, type, status, equipment } = req.body;
        
        const theater = await prisma.operatingTheater.create({
            data: {
                name,
                type,
                status: status || 'AVAILABLE',
                equipment
            }
        });
        
        res.status(201).json(theater);
    } catch (error) {
        console.error('Error creating theater:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Update Operating Theater (Admin)
 */
export const updateTheater = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, type, status, equipment } = req.body;
        
        const updateData: any = {};
        if (name) updateData.name = name;
        if (type) updateData.type = type;
        if (status) updateData.status = status;
        if (equipment !== undefined) updateData.equipment = equipment;
        
        const theater = await prisma.operatingTheater.update({
            where: { id: String(id) },
            data: updateData
        });
        
        res.json(theater);
    } catch (error) {
        console.error('Error updating theater:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
