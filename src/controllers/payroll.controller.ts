import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Generate Payroll for All Active Staff for a specific Month/Year
 * Formula: Net = Base + Bonus - Deductions - Tax
 */
export const generatePayroll = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.body;

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and Year are required' });
        }

        // 1. Get all active staff who have a base salary set
        const staffList = await prisma.staff.findMany({
            where: {
                employmentStatus: 'ACTIVE',
                baseSalary: { not: null }
            },
            include: { user: true }
        });

        const payrolls = [];
        const existingPayrolls = await prisma.payroll.findMany({
            where: { month, year: Number(year) }
        });
        
        const existingStaffIds = new Set(existingPayrolls.map(p => p.staffId));

        // 2. Calculate Payroll for each staff
        for (const staff of staffList) {
            // Skip if already generated
            if (existingStaffIds.has(staff.id)) continue;

            const baseSalary = staff.baseSalary || 0;
            const bonuses = 0; // Default for now
            const deductions = 0; // Default
            const tax = 0; // Admin should input tax after generation
            const netSalary = baseSalary + bonuses - deductions - tax;

            payrolls.push({
                staffId: staff.id,
                month,
                year: Number(year),
                baseSalary,
                bonuses,
                deductions,
                tax,
                netSalary,
                status: 'PENDING'
            });
        }

        if (payrolls.length === 0) {
            return res.status(200).json({ message: 'No new payrolls to generate', count: 0 });
        }

        // 3. Batch Insert
        await prisma.payroll.createMany({
            data: payrolls
        });

        res.status(201).json({ message: `Generated payroll for ${payrolls.length} staff`, count: payrolls.length });

    } catch (error) {
        console.error("Generate Payroll Error:", error);
        res.status(500).json({ message: 'Failed to generate payroll' });
    }
};

/**
 * Get All Payrolls (Admin View)
 */
export const getPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.query;
        
        const where: any = {};
        if (month) where.month = String(month);
        if (year) where.year = Number(year);

        const payrolls = await prisma.payroll.findMany({
            where,
            include: {
                staff: {
                    include: { user: { select: { firstName: true, lastName: true, email: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(payrolls);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch payrolls', error });
    }
};

/**
 * Get My Payrolls (Staff View)
 */
export const getMyPayrolls = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const staff = await prisma.staff.findUnique({ where: { userId } });

        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        const payrolls = await prisma.payroll.findMany({
            where: { staffId: staff.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json(payrolls);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch your payrolls', error });
    }
};

/**
 * Mark Payroll as Paid
 */
export const markAsPaid = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);

        await prisma.payroll.update({
            where: { id },
            data: {
                status: 'PAID',
                paymentDate: new Date()
            }
        });

        res.json({ message: 'Payroll marked as paid' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update payroll status', error });
    }
};

/**
 * Update Payroll (bonuses, deductions)
 */
export const updatePayroll = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const { bonuses, deductions, tax } = req.body;

        // Get current payroll to recalculate net
        const current = await prisma.payroll.findUnique({ where: { id } });
        if (!current) {
            return res.status(404).json({ message: 'Payroll not found' });
        }

        const newBonuses = bonuses !== undefined ? Number(bonuses) : current.bonuses;
        const newDeductions = deductions !== undefined ? Number(deductions) : current.deductions;
        const newTax = tax !== undefined ? Number(tax) : current.tax;

        const netSalary = current.baseSalary + newBonuses - newDeductions - newTax;

        const updated = await prisma.payroll.update({
            where: { id },
            data: {
                bonuses: newBonuses,
                deductions: newDeductions,
                tax: newTax,
                netSalary
            }
        });

        res.json(updated);
    } catch (error) {
        console.error("Update Payroll Error:", error);
        res.status(500).json({ message: 'Failed to update payroll' });
    }
};
