
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

/**
 * Get Messages for a Channel
 */
export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const channel = String(req.params.channel);
        
        const messages = await prisma.message.findMany({
            where: { channel },
            include: {
                sender: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' },
            take: 100 // Limit history
        });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
