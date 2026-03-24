import { Request, Response } from 'express';
import { prisma } from '../lib/prisma'; // Use singleton

// Helper to create notification (internal use)
export const createNotification = async (
    userId: string,
    message: string,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
    channel: 'IN_APP' | 'EMAIL' | 'SMS' = 'IN_APP'
) => {
    try {
        await prisma.notification.create({
            data: {
                userId,
                message,
                priority,
                channel,
                status: 'PENDING'
            }
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};

export const getUserNotifications = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id; // Safe access
        if (!userId) {
            console.error("getUserNotifications: User ID missing from request");
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20 // Limit to last 20
        });
        res.json(notifications);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: 'Error fetching notifications', error: String(error) });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const notification = await prisma.notification.update({
            where: { id: id as string },
            data: { 
                status: 'READ',
                readAt: new Date()
            }
        });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
};

export const markAllAsRead = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        await prisma.notification.updateMany({
            where: { 
                userId,
                status: { not: 'READ' }
            },
            data: { 
                status: 'READ',
                readAt: new Date()
            }
        });
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
};
