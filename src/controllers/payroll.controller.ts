import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const PDFDocument = require('pdfkit');

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
            // Fetch actual bonuses and deductions from staff record
            const bonuses = (staff as any).bonusAmount || 0;
            const deductions = (staff as any).monthlyDeductions || 0;
            // Tax calculation: basic 10% on gross for now, should be configurable
            const tax = Math.round((baseSalary + bonuses) * 0.1);
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
        res.status(500).json({ message: 'Failed to fetch payrolls' });
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
        res.status(500).json({ message: 'Failed to fetch your payrolls' });
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
        res.status(500).json({ message: 'Failed to update payroll status' });
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

/**
 * Download Payslip as PDF
 */
export const downloadPayslipPDF = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const userId = req.user?.id;

        // Get the payroll record
        const payroll = await prisma.payroll.findUnique({
            where: { id },
            include: {
                staff: {
                    include: { user: true }
                }
            }
        });

        if (!payroll) {
            return res.status(404).json({ message: 'Payroll not found' });
        }

        // Verify ownership (staff can only download their own)
        if (payroll.staff.userId !== userId) {
            // Allow admin to download any
            const currentUser = await prisma.user.findUnique({ where: { id: userId } });
            if (currentUser?.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }

        // Null-safe numeric fields so a missing value can't crash PDF generation.
        const baseSalary = payroll.baseSalary ?? 0;
        const bonuses = payroll.bonuses ?? 0;
        const tax = payroll.tax ?? 0;
        const deductions = payroll.deductions ?? 0;
        const netSalary = payroll.netSalary ?? (baseSalary + bonuses - tax - deductions);
        const fmt = (n: number) => n.toLocaleString();

        const doc = new PDFDocument();

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=payslip-${payroll.month}-${payroll.year}.pdf`);

        doc.pipe(res);

        // Header with Logo placeholder
        doc.fontSize(20).font('Helvetica-Bold').text('OltraHMS', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('PAYSLIP', { align: 'center' });
        doc.moveDown();

        // Period
        doc.fontSize(12).text(`Period: ${payroll.month} ${payroll.year}`, { align: 'center' });
        doc.moveDown(2);

        // Employee Details
        doc.fontSize(11).font('Helvetica-Bold');
        doc.text('Employee Details');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Name: ${payroll.staff.user.firstName} ${payroll.staff.user.lastName}`);
        doc.text(`Employee ID: ${payroll.staff.id}`);
        doc.moveDown();

        // Earnings & Deductions Table
        const startY = doc.y;
        
        doc.font('Helvetica-Bold').fontSize(11);
        doc.text('Earnings', 50, startY);
        doc.text('Amount', 200, startY, { width: 100, align: 'right' });
        doc.text('Deductions', 350, startY);
        doc.text('Amount', 500, startY, { width: 80, align: 'right' });
        
        doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
        doc.moveDown();

        doc.font('Helvetica').fontSize(10);
        doc.text('Base Salary', 50);
        doc.text(fmt(baseSalary), 200, { width: 100, align: 'right' });
        doc.text('Tax', 350);
        doc.text(fmt(tax), 500, { width: 80, align: 'right' });

        doc.text('Bonuses', 50);
        doc.text(fmt(bonuses), 200, { width: 100, align: 'right' });
        doc.text('Other Deductions', 350);
        doc.text(fmt(deductions), 500, { width: 80, align: 'right' });

        doc.moveDown(2);

        // Totals
        doc.font('Helvetica-Bold').fontSize(11);
        const totalY = doc.y;
        doc.text('Total Earnings:', 50, totalY);
        doc.text(fmt(baseSalary + bonuses), 200, { width: 100, align: 'right' });
        doc.text('Total Deductions:', 350, totalY);
        doc.text(fmt(tax + deductions), 500, { width: 80, align: 'right' });

        doc.moveDown(2);

        // Net Salary (highlighted)
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text(`NET SALARY: ${fmt(netSalary)}`, { align: 'center' });

        doc.moveDown(2);

        // Footer
        doc.fontSize(8).font('Helvetica').text('This is a computer-generated document.', { align: 'center' });
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error("Download Payslip Error:", error);
        res.status(500).json({ message: 'Failed to download payslip' });
    }
};
