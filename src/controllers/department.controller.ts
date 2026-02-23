import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get All Departments
 */
export const getAllDepartments = async (req: AuthRequest, res: Response) => {
    try {
        const departments = await prisma.department.findMany({
            include: {
                _count: {
                    select: { staff: true }
                },
                headOfDept: {
                    include: {
                        user: {
                            select: { firstName: true, lastName: true }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(departments);
    } catch (error) {
        console.error("Get Departments Error:", error);
        res.status(500).json({ message: 'Failed to fetch departments' });
    }
};

/**
 * Create Department
 */
export const createDepartment = async (req: AuthRequest, res: Response) => {
    try {
        const { name, description } = req.body;
        const headOfDeptId = req.body.headOfDeptId as string | undefined;

        const existing = await prisma.department.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Department with this name already exists' });
        }

        const department = await prisma.department.create({
            data: {
                name,
                description,
                headOfDeptId: headOfDeptId || null
            }
        });

        res.status(201).json(department);
    } catch (error) {
        console.error("Create Department Error:", error);
        res.status(500).json({ message: 'Failed to create department' });
    }
};

/**
 * Update Department
 */
export const updateDepartment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string }; // Explicit cast
        const { name, description } = req.body;
        const headOfDeptId = req.body.headOfDeptId as string | undefined;

        const department = await prisma.department.update({
            where: { id },
            data: {
                name,
                description,
                headOfDeptId: headOfDeptId || null
            }
        });

        res.json(department);
    } catch (error) {
        console.error("Update Department Error:", error);
        res.status(500).json({ message: 'Failed to update department' });
    }
};

/**
 * Delete Department
 */
export const deleteDepartment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string };

        // Optional: Check if staff are assigned before deleting? 
        // For now, simple delete. Schema might restrict if foreign keys exist without cascade.
        // We'll disconnect staff first to be safe or rely on behavior. 
        // Staff -> Department is optional, so setting to null is fine.

        await prisma.$transaction(async (tx) => {
            // Unlink staff
            await tx.staff.updateMany({
                where: { departmentId: id },
                data: { departmentId: null }
            });

            await tx.department.delete({ where: { id } });
        });

        res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error("Delete Department Error:", error);
        res.status(500).json({ message: 'Failed to delete department' });
    }
};
