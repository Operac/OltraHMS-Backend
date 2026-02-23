import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get Services - Supports filtering
export const getServices = async (req: Request, res: Response) => {
    try {
        const { type, isExternal } = req.query;

        const where: any = {};
        if (type) where.type = type;
        if (isExternal) where.isExternal = isExternal === 'true';

        const services = await prisma.service.findMany({
            where,
            orderBy: { name: 'asc' }
        });
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching services', error });
    }
};

// Create Service
export const createService = async (req: Request, res: Response) => {
    try {
        const { name, type, price, code, isExternal, departmentId } = req.body;

        const service = await prisma.service.create({
            data: {
                name,
                type,
                price: Number(price),
                code,
                isExternal: isExternal || false,
                departmentId
            }
        });
        res.status(201).json(service);
    } catch (error) {
        res.status(500).json({ message: 'Error creating service', error });
    }
};

// Update Service
export const updateService = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, price, isExternal } = req.body;

        const service = await prisma.service.update({
            where: { id: id as string },
            data: {
                name,
                price: price ? Number(price) : undefined,
                isExternal
            }
        });
        res.json(service);
    } catch (error) {
        res.status(500).json({ message: 'Error updating service', error });
    }
};

// Delete Service
export const deleteService = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.service.delete({ where: { id: id as string } });
        res.json({ message: 'Service deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting service', error });
    }
};
