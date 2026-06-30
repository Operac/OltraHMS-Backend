import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────
// Group channel access rules
// ─────────────────────────────────────────────────────────────
const CHANNEL_ROLES: Record<string, string[]> = {
    general:  ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECH', 'RADIOLOGIST', 'ACCOUNTANT', 'INSURANCE_OFFICER'],
    doctors:  ['ADMIN', 'DOCTOR'],
    nurses:   ['ADMIN', 'DOCTOR', 'NURSE'],
    handover: ['ADMIN', 'DOCTOR', 'NURSE'],
};

// Build a deterministic, sorted DM channel string for two users
export function dmChannel(userIdA: string, userIdB: string): string {
    const sorted = [userIdA, userIdB].sort();
    return `dm:${sorted[0]}:${sorted[1]}`;
}

// Check whether a channel string is a DM channel that userId is part of
function isValidDMParticipant(channel: string, userId: string): boolean {
    if (!channel.startsWith('dm:')) return false;
    const parts = channel.split(':');
    if (parts.length !== 3) return false;
    return parts[1] === userId || parts[2] === userId;
}

// ─────────────────────────────────────────────────────────────
// GET /chat/channels  — group channels available to this role
// ─────────────────────────────────────────────────────────────
export const getAvailableChannels = async (req: AuthRequest, res: Response) => {
    const userRole = req.user?.role as string;
    const available = Object.entries(CHANNEL_ROLES)
        .filter(([, roles]) => roles.includes(userRole))
        .map(([id]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
    res.json(available);
};

// ─────────────────────────────────────────────────────────────
// GET /chat/staff  — all active staff members (for DM picker)
// ─────────────────────────────────────────────────────────────
export const getChatableStaff = async (req: AuthRequest, res: Response) => {
    try {
        const myId = req.user?.id;
        const staff = await prisma.user.findMany({
            where: {
                isDeleted: false,
                status: 'ACTIVE',
                role: { not: 'PATIENT' },
                id: { not: myId },        // exclude self
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                staff: {
                    select: {
                        department: { select: { name: true } },
                        specialization: true,
                    }
                }
            },
            orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
        });

        res.json(staff.map(u => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
            department: u.staff?.department?.name ?? null,
            specialization: u.staff?.specialization ?? null,
        })));
    } catch (error) {
        console.error('Error fetching staff for chat:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /chat/conversations  — DM threads this user participates in
// ─────────────────────────────────────────────────────────────
export const getConversations = async (req: AuthRequest, res: Response) => {
    try {
        const myId = req.user!.id;
        const prefix = `dm:`;

        // Find all DM channels this user is in by looking at their sent/received messages
        const dmMessages = await prisma.message.findMany({
            where: {
                channel: { startsWith: prefix },
                OR: [
                    { channel: { contains: myId } }, // crude filter; exact check below
                ]
            },
            select: { channel: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        // Filter to only DM channels where myId is actually a participant
        const myChannels = [...new Set(
            dmMessages
                .filter(m => isValidDMParticipant(m.channel, myId))
                .map(m => m.channel)
        )];

        if (myChannels.length === 0) return res.json([]);

        // For each DM channel, get the other participant's info + last message
        const conversations = await Promise.all(myChannels.map(async (channel) => {
            const parts = channel.split(':');
            const otherId = parts[1] === myId ? parts[2] : parts[1];

            const [otherUser, lastMessage, unreadCount] = await Promise.all([
                prisma.user.findUnique({
                    where: { id: otherId },
                    select: { id: true, firstName: true, lastName: true, role: true }
                }),
                prisma.message.findFirst({
                    where: { channel },
                    orderBy: { createdAt: 'desc' },
                    select: { content: true, createdAt: true, senderId: true }
                }),
                prisma.message.count({
                    where: { channel, senderId: { not: myId } }
                    // Note: real unread tracking needs a read-receipts table; this is a count of all non-mine
                }),
            ]);

            return {
                channel,
                otherUser,
                lastMessage,
            };
        }));

        // Sort by most recent message
        conversations.sort((a, b) =>
            (b.lastMessage?.createdAt?.getTime() ?? 0) - (a.lastMessage?.createdAt?.getTime() ?? 0)
        );

        res.json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────
// GET /chat/:channel  — message history (group or DM)
// ─────────────────────────────────────────────────────────────
export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const channel = String(req.params.channel);
        const userId  = req.user!.id;
        const userRole = req.user?.role as string;

        // ── DM channel ─────────────────────────────────────────────────
        if (channel.startsWith('dm:')) {
            if (!isValidDMParticipant(channel, userId)) {
                return res.status(403).json({ message: 'You are not a participant in this conversation' });
            }
        } else {
            // ── Group channel ───────────────────────────────────────────
            if (!CHANNEL_ROLES[channel]) {
                return res.status(404).json({ message: 'Channel not found' });
            }
            if (!CHANNEL_ROLES[channel].includes(userRole)) {
                return res.status(403).json({ message: `You do not have access to #${channel}` });
            }
        }

        const messages = await prisma.message.findMany({
            where: { channel },
            include: {
                sender: { select: { id: true, firstName: true, lastName: true, role: true } }
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
        });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
