import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get balances for a specific staff member
 */
export const getStaffBalances = async (req: AuthRequest, res: Response) => {
    try {
        const staffId = String(req.params.staffId);

        // Fetch all leave types, then merge with existing balances
        const leaveTypes = await prisma.leaveType.findMany();
        const existingBalances = await prisma.staffLeaveBalance.findMany({
            where: { staffId }
        });

        const balances = leaveTypes.map(type => {
            const balance = existingBalances.find(b => b.leaveTypeId === type.id);
            return {
                leaveTypeId: type.id,
                leaveTypeName: type.name,
                allocatedDays: balance ? balance.allocatedDays : type.defaultDays,
                usedDays: balance ? balance.usedDays : 0,
                isPaid: type.isPaid
            };
        });

        res.json(balances);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch staff balances', error });
    }
};

/**
 * Update or assign a specific balance for a staff
 */
export const updateStaffBalance = async (req: AuthRequest, res: Response) => {
    try {
        const staffId = String(req.params.staffId);
        const leaveTypeId = String(req.params.leaveTypeId);
        const { allocatedDays } = req.body;

        const balance = await prisma.staffLeaveBalance.upsert({
            where: {
                staffId_leaveTypeId: { staffId, leaveTypeId }
            },
            update: {
                allocatedDays: Number(allocatedDays)
            },
            create: {
                staffId,
                leaveTypeId,
                allocatedDays: Number(allocatedDays),
                usedDays: 0
            }
        });

        res.json(balance);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update balance', error });
    }
};
