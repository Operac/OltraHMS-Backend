import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get all leave types
 */
export const getLeaveTypes = async (_req: AuthRequest, res: Response) => {
    try {
        const types = await prisma.leaveType.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch leave types' });
    }
};

/**
 * Create a new leave type
 */
export const createLeaveType = async (req: AuthRequest, res: Response) => {
    try {
        const { name, defaultDays, isPaid } = req.body;

        const existing = await prisma.leaveType.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Leave type already exists' });
        }

        const leaveType = await prisma.leaveType.create({
            data: { name, defaultDays: Number(defaultDays), isPaid }
        });

        res.status(201).json(leaveType);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create leave type' });
    }
};

/**
 * Update a leave type
 */
export const updateLeaveType = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const { name, defaultDays, isPaid } = req.body;

        const leaveType = await prisma.leaveType.update({
            where: { id },
            data: { 
                ...(name && { name }),
                ...(defaultDays !== undefined && { defaultDays: Number(defaultDays) }),
                ...(isPaid !== undefined && { isPaid })
            }
        });

        res.json(leaveType);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update leave type' });
    }
};

/**
 * Delete a leave type
 */
export const deleteLeaveType = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        
        // Ensure no requests are using this type
        const count = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
        
        if (count > 0) {
            return res.status(400).json({ message: 'Cannot delete leave type that is actively in use.' });
        }

        await prisma.leaveType.delete({ where: { id } });
        res.json({ message: 'Leave type deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete leave type' });
    }
};
