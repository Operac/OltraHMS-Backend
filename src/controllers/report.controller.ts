import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get Financial Stats
 * - Total Revenue
 * - Revenue by status (Paid vs Pending)
 * - Daily Revenue Trend (Last 7 days)
 */
export const getFinancialStats = async (req: AuthRequest, res: Response) => {
    try {
        const totalRevenue = await prisma.invoice.aggregate({
            _sum: { total: true },
            where: { status: 'PAID' }
        });

        const pendingRevenue = await prisma.invoice.aggregate({
            _sum: { total: true },
            where: { status: 'ISSUED' }
        });

        // Simple aggregation for last 7 days would typically require raw SQL or grouping.
        // For now, we return high-level summaries.
        
        res.json({
            totalRevenue: totalRevenue._sum.total || 0,
            pendingRevenue: pendingRevenue._sum.total || 0,
            currency: 'USD' 
        });
    } catch (error) {
        console.error("Financial Stats Error:", error);
        res.status(500).json({ message: 'Failed to fetch financial stats' });
    }
};

/**
 * Get Patient Stats
 * - Total Patients
 * - New Patients (Last 30 days)
 * - Gender Distribution
 */
export const getPatientStats = async (req: AuthRequest, res: Response) => {
    try {
        const totalPatients = await prisma.patient.count();
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newPatients = await prisma.patient.count({
            where: { createdAt: { gte: thirtyDaysAgo } }
        });

        const genderDistribution = await prisma.patient.groupBy({
            by: ['gender'],
            _count: { gender: true }
        });

        res.json({
            totalPatients,
            newPatients,
            genderDistribution
        });
    } catch (error) {
        console.error("Patient Stats Error:", error);
        res.status(500).json({ message: 'Failed to fetch patient stats' });
    }
};

/**
 * Get Inventory Stats
 * - Low Stock Items
 * - Expiring Soon Items
 */
export const getInventoryStats = async (req: AuthRequest, res: Response) => {
    try {
        const lowStock = await prisma.medication.count({
            where: { 
                inventory: { 
                    some: { quantity: { lte: 10 } } // Simplification: Logic should compare sum of batches vs reorderLevel
                } 
            }
        });

        // Checking expiry in next 30 days
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);

        const expiringSoon = await prisma.inventoryBatch.count({
            where: { 
                expiryDate: { lte: nextMonth, gte: new Date() } 
            }
        });

        res.json({
            lowStock,
            expiringSoon
        });
    } catch (error) {
        console.error("Inventory Stats Error:", error);
        res.status(500).json({ message: 'Failed to fetch inventory stats' });
    }
};
