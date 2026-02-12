import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

/**
 * Get System Statistics for Dashboard
 */
export const getSystemStats = async (req: AuthRequest, res: Response) => {
    try {
        const [
            totalPatients,
            activeStaff,
            todayAppointments,
            unpaidInvoices
        ] = await Promise.all([
            prisma.patient.count(),
            prisma.user.count({ where: { role: { not: 'PATIENT' }, status: 'ACTIVE' } }),
            prisma.appointment.count({
                where: {
                    startTime: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lt: new Date(new Date().setHours(23, 59, 59, 999))
                    }
                }
            }),
            prisma.invoice.aggregate({
                where: { status: 'ISSUED' },
                _sum: { total: true }
            })
        ]);

        res.json({
            totalPatients,
            activeStaff,
            todayAppointments,
            revenuePending: unpaidInvoices._sum.total || 0
        });
    } catch (error) {
        console.error("Stats Error:", error);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
};

/**
 * Get All Staff (Users with roles != PATIENT)
 */
export const getAllStaff = async (req: AuthRequest, res: Response) => {
    try {
        const staff = await prisma.user.findMany({
            where: { role: { not: 'PATIENT' } },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                status: true,
                staff: {
                    select: {
                        departmentId: true,
                        specialization: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch staff' });
    }
};

/**
 * Create New Staff Member (User + Staff Profile)
 */
export const createStaff = async (req: AuthRequest, res: Response) => {
    try {
        const { firstName, lastName, email, password, role, departmentId, specialization } = req.body;

        // Validation
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        // Transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create User
            const user = await tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    passwordHash: hashedPassword,
                    role: role as Role,
                    status: 'ACTIVE'
                }
            });

            // 2. Create Staff Profile
            // Generate Staff Number
            const staffNumber = `STF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

            await tx.staff.create({
                data: {
                    userId: user.id,
                    staffNumber,
                    departmentId: departmentId || null, // Optional for Admin
                    specialization: specialization || 'General',
                    hireDate: new Date()
                }
            });

            // 3. Log Audit
            await tx.auditLog.create({
                data: {
                    userId: req.user?.id || 'SYSTEM',
                    action: 'CREATE_STAFF',
                    entityType: 'User',
                    entityId: user.id,
                    details: `Created staff ${role}: ${email}`
                }
            });

            return user;
        });

        res.status(201).json(result);
    } catch (error) {
        console.error("Create Staff Error:", error);

        res.status(500).json({ message: 'Failed to create staff', error: (error as any).message });
    }
};

/**
 * Get Staff Details by ID
 */
export const getStaffDetails = async (req: AuthRequest, res: Response) => {
    try {
        const userId = String(req.params.userId);
        const staff = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                staff: true // Removed department include
            }
        });

        if (!staff) return res.status(404).json({ message: 'Staff member not found' });

        res.json(staff);
    } catch (error) {
        console.error("Get Staff Details Error:", error);
        res.status(500).json({ message: 'Failed to fetch staff details' });
    }
};

/**
 * Delete Staff Member (Hard Delete)
 */
export const deleteStaff = async (req: AuthRequest, res: Response) => {
    try {
        const userId = String(req.params.userId);

        await prisma.$transaction(async (tx) => {
             // Delete Staff Profile first (if user has one)
             await tx.staff.deleteMany({ where: { userId } });
             
             // Delete User
             const deletedUser = await tx.user.delete({ where: { id: userId } });
             
             // Log Audit
             await tx.auditLog.create({
                data: {
                    userId: req.user?.id || 'SYSTEM',
                    action: 'DELETE_STAFF',
                    entityType: 'User',
                    entityId: userId,
                    details: `Deleted user: ${deletedUser.email} (${deletedUser.role})`
                }
            });
        });

        res.json({ message: 'Staff member deleted successfully' });
    } catch (error) {
         console.error("Delete Staff Error:", error);
         res.status(500).json({ message: 'Failed to delete staff' });
    }
};

/**
 * Update Staff Status (Disable/Enable)
 */
export const updateStaffStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = String(req.params.userId);
        const { status } = req.body; // 'ACTIVE' | 'INACTIVE'

        await prisma.user.update({
            where: { id: userId },
            data: { status }
        });

        await prisma.auditLog.create({
            data: {
                userId: req.user?.id || 'SYSTEM',
                action: 'UPDATE_STAFF_STATUS',
                entityType: 'User',
                entityId: userId,
                details: `Updated staff status to ${status}`
            }
        });

        res.json({ message: 'Staff status updated' });
    } catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ message: 'Failed to update status' });
    }
};

/**
 * Get System Audit Logs
 */
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const { action } = req.query;
        const where = action ? { action: String(action) } : {};

        const logs = await prisma.auditLog.findMany({
            where,
            take: 100,
            orderBy: { timestamp: 'desc' },
            include: {
                user: {
                    select: { firstName: true, lastName: true, role: true }
                }
            }
        });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Failed to fetch logs', error: (error as Error).message });
    }
};
