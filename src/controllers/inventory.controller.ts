import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get all inventory status with batch details
 * Aggregates quantity across valid batches
 */
export const getInventoryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const inventory = await prisma.medication.findMany({
            include: {
                inventory: {
                    where: { 
                        quantity: { gt: 0 } 
                    },
                    orderBy: { expiryDate: 'asc' } // FEFO (First Expired First Out) suggestion
                }
            }
        });

        const formatted = inventory.map(med => {
            const totalStock = med.inventory.reduce((sum, batch) => sum + batch.quantity, 0);
            return {
                ...med,
                totalStock,
                batches: med.inventory
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ message: 'Failed to fetch inventory' });
    }
};

/**
 * Receive new stock (Purchase Order)
 * Creates a new InventoryBatch
 */
export const receiveStock = async (req: AuthRequest, res: Response) => {
    try {
        const { medicationId, batchNumber, expiryDate, quantity, costPrice, supplier } = req.body;

        if (!medicationId || !batchNumber || !quantity || !expiryDate) {
            return res.status(400).json({ message: 'Missing required purchase order fields' });
        }

        const batch = await prisma.inventoryBatch.create({
            data: {
                medicationId,
                batchNumber,
                expiryDate: new Date(expiryDate),
                quantity: Number(quantity),
                costPrice: Number(costPrice),
                supplier
            }
        });

        // Log audit
        await prisma.auditLog.create({
            data: {
                userId: req.user?.id,
                action: 'RECEIVE_STOCK',
                entityType: 'InventoryBatch',
                entityId: batch.id,
                details: `Received ${quantity} units of Med ${medicationId}, Batch ${batchNumber}`
            }
        });

        res.json(batch);
    } catch (error) {
        console.error("Error receiving stock:", error);
        res.status(500).json({ message: 'Failed to receive stock' });
    }
};

/**
 * Check for items below reorder level
 */
export const getLowStockAlerts = async (req: AuthRequest, res: Response) => {
    try {
        const meds = await prisma.medication.findMany({
            include: {
                inventory: { where: { quantity: { gt: 0 } } }
            }
        });

        const lowStock = meds.filter(med => {
            const total = med.inventory.reduce((sum, b) => sum + b.quantity, 0);
            return total <= med.reorderLevel;
        }).map(med => ({
            id: med.id,
            name: med.name,
            currentStock: med.inventory.reduce((sum, b) => sum + b.quantity, 0),
            reorderLevel: med.reorderLevel
        }));

        res.json(lowStock);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch alerts' });
    }
};
