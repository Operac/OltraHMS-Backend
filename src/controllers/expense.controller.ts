import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Create Expense
export const addExpense = async (req: Request, res: Response) => {
    try {
        const { description, amount, category, incurredAt } = req.body;
        // Assume User is attached to req by middleware
        const userId = (req as any).user?.id; 

        const expense = await prisma.expense.create({
            data: {
                description,
                amount: Number(amount),
                category,
                incurredAt: incurredAt ? new Date(incurredAt) : new Date(),
                recordedBy: { connect: { id: userId } }
            }
        });
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ message: 'Error adding expense', error });
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
        res.status(500).json({ message: 'Error fetching expenses', error });
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
        res.status(500).json({ message: 'Error calculating profit/loss', error });
    }
};
