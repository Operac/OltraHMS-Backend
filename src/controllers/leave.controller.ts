import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Request Leave (Staff)
 */
export const requestLeave = async (req: AuthRequest, res: Response) => {
    try {
        const { leaveTypeId, startDate, endDate, reason } = req.body;
        const staffId = req.user?.id;

        const staff = await prisma.staff.findUnique({ where: { userId: staffId } });
        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        // 1. Time-Travel Validation
        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
            return res.status(400).json({ message: 'Leave start date cannot be in the past.' });
        }
        if (end < start) {
            return res.status(400).json({ message: 'End date must be after start date.' });
        }

        // Calculate days
        const timeDiff = end.getTime() - start.getTime();
        const days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

        // 2. Overlap Validation
        const overlapping = await prisma.leaveRequest.findFirst({
            where: {
                staffId: staff.id,
                status: { in: ['PENDING', 'APPROVED'] },
                AND: [
                    { startDate: { lte: end } },
                    { endDate: { gte: start } }
                ]
            }
        });

        if (overlapping) {
            return res.status(400).json({ message: 'You already have a pending or approved leave during these dates.' });
        }

        // 3. Balance Validation
        const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
        if (!leaveType) return res.status(404).json({ message: 'Leave type not found.' });

        const balance = await prisma.staffLeaveBalance.findUnique({
            where: { staffId_leaveTypeId: { staffId: staff.id, leaveTypeId } }
        });

        const allocatedDays = balance ? balance.allocatedDays : leaveType.defaultDays;
        const usedDays = balance ? balance.usedDays : 0;
        const remaining = allocatedDays - usedDays;

        if (days > remaining) {
            return res.status(400).json({ 
                message: `Insufficient leave balance. You have ${remaining} days remaining for this type.`,
                requested: days 
            });
        }

        // Create Request
        const leave = await prisma.leaveRequest.create({
            data: {
                staffId: staff.id,
                leaveTypeId,
                startDate: start,
                endDate: end,
                days,
                reason,
                status: 'PENDING'
            }
        });

        res.status(201).json(leave);
    } catch (error) {
        res.status(500).json({ message: 'Failed to request leave' });
    }
};

/**
 * Approve/Reject Leave (Admin)
 */
export const updateLeaveStatus = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const { status } = req.body; // APPROVED, REJECTED
        const approverId = req.user?.id;
        const role = req.user?.role;

        const approverStaff = await prisma.staff.findUnique({ where: { userId: approverId } });
        
        if (!approverStaff && role !== 'ADMIN') {
            return res.status(403).json({ message: 'Approver must be staff/admin' });
        }

        const leave = await prisma.leaveRequest.findUnique({ 
            where: { id },
            include: { staff: true, leaveType: true }
        });

        if (!leave) return res.status(404).json({ message: 'Leave request not found' });
        if (leave.status !== 'PENDING') {
            return res.status(400).json({ message: 'Leave request already processed' });
        }

        // Transaction to update status and deduct balance if approved
        await prisma.$transaction(async (tx) => {
            await tx.leaveRequest.update({
                where: { id },
                data: {
                    status,
                    ...(approverStaff && { approvedById: approverStaff.id })
                }
            });

            if (status === 'APPROVED') {
                // Upsert balance to track usage
                await tx.staffLeaveBalance.upsert({
                    where: {
                        staffId_leaveTypeId: { staffId: leave.staffId, leaveTypeId: leave.leaveTypeId }
                    },
                    update: {
                        usedDays: { increment: leave.days }
                    },
                    create: {
                        staffId: leave.staffId,
                        leaveTypeId: leave.leaveTypeId,
                        allocatedDays: leave.leaveType.defaultDays,
                        usedDays: leave.days
                    }
                });
            }
        });

        res.json({ message: `Leave request ${status}` });

    } catch (error) {
        res.status(500).json({ message: 'Failed to update leave status' });
    }
};

/**
 * Get All Leave Requests (Admin)
 */
export const getAllLeaves = async (req: AuthRequest, res: Response) => {
    try {
        const statusStr = req.query.status as string | undefined;
        const where = statusStr ? { status: statusStr } : {};

        const leaves = await prisma.leaveRequest.findMany({
            where,
            include: {
                staff: {
                    include: { user: { select: { firstName: true, lastName: true } } }
                },
                leaveType: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leaves);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch leave requests' });
    }
};

/**
 * Get My Leave Requests (Staff)
 */
export const getMyLeaves = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const staff = await prisma.staff.findUnique({ where: { userId } });

        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        const leaves = await prisma.leaveRequest.findMany({
            where: { staffId: staff.id },
            include: { leaveType: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leaves);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch your leave requests' });
    }
};

/**
 * Get Conflicting Leaves (Admin)
 */
export const getConflictingLeaves = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id); // ID of the pending leave request
        
        const targetLeave = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { staff: true }
        });

        if (!targetLeave || !targetLeave.staff.departmentId) {
            return res.json([]); // No department = no conflict possible, or request invalid
        }

        // Find overlapping APPROVED leaves for staff in the SAME department
        const conflicts = await prisma.leaveRequest.findMany({
            where: {
                id: { not: targetLeave.id },
                status: 'APPROVED',
                staffId: { not: '' }, // Just to satisfy nested query structure, though filtering by staff happens below
                staff: {
                    departmentId: targetLeave.staff.departmentId,
                },
                AND: [
                    { startDate: { lte: targetLeave.endDate } },
                    { endDate: { gte: targetLeave.startDate } }
                ]
            },
            include: {
                staff: {
                    include: { user: { select: { firstName: true, lastName: true } } }
                }
            }
        });

        res.json(conflicts);

    } catch (error) {
        res.status(500).json({ message: 'Failed to check conflicts' });
    }
};
