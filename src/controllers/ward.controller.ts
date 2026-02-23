import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';

const createWardSchema = z.object({
  name: z.string(),
  type: z.string(), // e.g. GENERAL, ICU, MATERNITY
  capacity: z.number().int().positive(),
  basePrice: z.number().min(0).optional()
});

const createBedSchema = z.object({
  wardId: z.string(),
  number: z.string(),
  type: z.string().optional(),
  price: z.number().min(0).optional()
});

export const getWards = async (req: AuthRequest, res: Response) => {
    try {
        const wards = await prisma.ward.findMany({
            include: { beds: true },
            orderBy: { name: 'asc' }
        });
        res.json(wards);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch wards' });
    }
};

export const createWard = async (req: AuthRequest, res: Response) => {
    try {
        const data = createWardSchema.parse(req.body);
        const ward = await prisma.ward.create({ data });
        res.status(201).json(ward);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
             return res.status(400).json({ message: 'Validation error: ' + (error as any).errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') });
        }
        // Handle Prisma unique constraint error
        if (error.code === 'P2002') {
             return res.status(400).json({ message: 'A ward with this name already exists.' });
        }
        
        console.error("Ward Creation Error:", error);
        res.status(400).json({ message: error.message || 'Validation failed' });
    }
};

export const createBed = async (req: AuthRequest, res: Response) => {
    try {
        const data = createBedSchema.parse(req.body);
        
        // Check capacity
        const ward = await prisma.ward.findUnique({ where: { id: data.wardId } });
        if (!ward) return res.status(404).json({ message: 'Ward not found' });
        
        const bedsCount = await prisma.bed.count({ where: { wardId: data.wardId } });
        if (bedsCount >= ward.capacity) return res.status(400).json({ message: 'Ward capacity reached' });

        const bed = await prisma.bed.create({ data });
        res.status(201).json(bed);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Validation failed' });
    }
};

export const deleteWard = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const ward = await prisma.ward.findUnique({ where: { id } });
        if (!ward) return res.status(404).json({ message: 'Ward not found' });
        
        const bedsCount = await prisma.bed.count({ where: { wardId: id } });
        if (bedsCount > 0) return res.status(400).json({ message: 'Cannot delete ward with existing beds' });
        
        await prisma.ward.delete({ where: { id } });
        res.json({ message: 'Ward deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete ward' });
    }
};

export const deleteBed = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const bed = await prisma.bed.findUnique({ where: { id } });
        if (!bed) return res.status(404).json({ message: 'Bed not found' });
        if (!['VACANT_CLEAN', 'VACANT_DIRTY', 'MAINTENANCE'].includes(bed.status)) {
            return res.status(400).json({ message: 'Cannot delete occupied bed' });
        }
        
        await prisma.bed.delete({ where: { id } });
        res.json({ message: 'Bed deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete bed' });
    }
};
