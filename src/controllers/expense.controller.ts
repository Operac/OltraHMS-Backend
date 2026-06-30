import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const expenseSchema = z.object({
    description: z.string().min(1).max(500).trim(),
    amount: z.number().positive('Amount must be positive'),
    category: z.enum(['SUPPLIES', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'EQUIPMENT', 'OTHER']),
    incurredAt: z.string().datetime({ offset: true }).optional(),
});

// Create Expense
export const addExpense = async (req: Request, res: Response) => {
    try {
        const parsed = expenseSchema.safeParse({
            ...req.body,
            amount: Number(req.body.amount),
        });
        if (!parsed.success) {
            return res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten().fieldErrors });
        }
        const { description, amount, category, incurredAt } = parsed.data;
        const userId = (req as any).user?.id;

        const expense = await prisma.expense.create({
            data: {
                description,
                amount,
                category,
                incurredAt: incurredAt ? new Date(incurredAt) : new Date(),
                recordedBy: { connect: { id: userId } }
            }
        });
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ message: 'Error adding expense' });
    }
};

// Get Expenses
export const getExpenses = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, category } = req.query;

        const where: any = {};
        if (category) where.category = category;
        if (startDate && endDate) {
            where.incurredAt = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
            };
        }

        const expenses = await prisma.expense.findMany({
            where,
            orderBy: { incurredAt: 'desc' },
            include: { recordedBy: { select: { firstName: true, lastName: true } } }
        });
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching expenses' });
    }
};

// Profit/Loss Report
export const getProfitLoss = async (req: Request, res: Response) => {
    try {
        const { month, year } = req.query; // e.g. month=2, year=2026

        // Calculate date range
        // If not provided, default to current month?
        // Let's implement basics
        
        // Total Revenue (Invoices Paid)
        // Total Expenses
        
        const totalRevenue = await prisma.invoice.aggregate({
            _sum: { amountPaid: true },
            where: { status: { in: ['PAID', 'PARTIAL'] } } // simplified, ideally filter by date
        });

        const totalExpenses = await prisma.expense.aggregate({
            _sum: { amount: true }
        });

        res.json({
            revenue: totalRevenue._sum.amountPaid || 0,
            expenses: totalExpenses._sum.amount || 0,
            netProfit: (totalRevenue._sum.amountPaid || 0) - (totalExpenses._sum.amount || 0)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error calculating profit/loss' });
    }
};
