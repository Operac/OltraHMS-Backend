import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { dmChannel } from '../controllers/chat.controller';

// Queue event types
export interface QueueEvent {
    type: 'PATIENT_CHECKED_IN' | 'PATIENT_CALLED' | 'PATIENT_WITH_DOCTOR' | 'PATIENT_COMPLETED' | 'PATIENT_TRIAGED' | 'QUEUE_UPDATED';
    appointmentId: string;
    patientId: string;
    patientName: string;
    tokenNumber: number;
    doctorId?: string;
    doctorName?: string;
    department?: string;
    timestamp: Date;
}

// ────────────────────────────────────────────────────────────
// Channel access rules — which roles can join each channel
// ────────────────────────────────────────────────────────────
const CHANNEL_ROLES: Record<string, string[]> = {
    general:  ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECH', 'RADIOLOGIST', 'ACCOUNTANT', 'INSURANCE_OFFICER'],
    doctors:  ['ADMIN', 'DOCTOR'],
    nurses:   ['ADMIN', 'DOCTOR', 'NURSE'],
    handover: ['ADMIN', 'DOCTOR', 'NURSE'],
};

function canJoinChannel(role: string, channel: string): boolean {
    const allowed = CHANNEL_ROLES[channel];
    if (!allowed) return false; // Unknown channel — deny
    return allowed.includes(role);
}

// ────────────────────────────────────────────────────────────
// Extract and verify the JWT from the socket handshake
// ────────────────────────────────────────────────────────────
function getUserFromSocket(socket: Socket): { id: string; role: string; firstName?: string; lastName?: string } | null {
    try {
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) return null;

        const secret = process.env.JWT_SECRET;
        if (!secret) return null;

        const decoded = jwt.verify(token, secret) as any;
        return decoded;
    } catch {
        return null;
    }
}

export const setupSocketHandlers = (io: any) => {
    // ────────────────────────────────────────────────────────
    // Queue namespace — used by reception, nurses, TV display
    // ────────────────────────────────────────────────────────
    const queueNamespace = io.of('/queue');

    queueNamespace.use((socket: Socket, next: (error?: Error) => void) => {
        const user = getUserFromSocket(socket);
        if (!user) return next(new Error('Authentication required'));
        socket.data.user = user;
        next();
    });

    queueNamespace.on('connection', (socket: Socket) => {
        const queueUser = socket.data.user as { id: string; role: string };

        socket.on('join-reception', () => {
            if (!['ADMIN', 'RECEPTIONIST'].includes(queueUser.role)) return;
            socket.join('reception');
        });

        socket.on('join-nurse-station', () => {
            if (!['ADMIN', 'DOCTOR', 'NURSE'].includes(queueUser.role)) return;
            socket.join('nurse-station');
        });

        socket.on('join-doctor', async (doctorId: string) => {
            if (typeof doctorId !== 'string' || doctorId.length > 100) return;
            if (queueUser.role === 'DOCTOR') {
                const staff = await prisma.staff.findUnique({
                    where: { userId: queueUser.id },
                    select: { id: true }
                });
                if (staff?.id !== doctorId) return;
            } else if (!['ADMIN', 'RECEPTIONIST'].includes(queueUser.role)) {
                return;
            }
            socket.join(`doctor-${doctorId}`);
        });

        socket.on('join-department', (departmentId: string) => {
            if (!['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'].includes(queueUser.role)) return;
            if (typeof departmentId !== 'string' || departmentId.length > 100) return;
            socket.join(`department-${departmentId}`);
        });

        socket.on('join-display', () => {
            if (!['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'].includes(queueUser.role)) return;
            socket.join('display');
        });

        socket.on('disconnect', () => {});
    });

    // Store reference for emitting events
    (global as any).queueIO = queueNamespace;

    // ────────────────────────────────────────────────────────
    // Main namespace — video signalling + authenticated chat
    // ────────────────────────────────────────────────────────
    io.on('connection', (socket: Socket) => {
        // Resolve the authenticated user for this socket session
        const socketUser = getUserFromSocket(socket);

        // ── Video call signalling (no role restriction) ──────
        socket.on('join-room', (roomId: string) => {
            if (!socketUser || typeof roomId !== 'string' || !roomId || roomId.length > 200) return;
            socket.join(roomId);
            socket.to(roomId).emit('user-connected', socket.id);
        });

        socket.on('offer', (data: { offer: any; roomId: string }) => {
            if (!socketUser || typeof data?.roomId !== 'string' || data.roomId.length > 200) return;
            socket.to(data.roomId).emit('offer', { offer: data.offer, senderId: socket.id });
        });

        socket.on('answer', (data: { answer: any; roomId: string }) => {
            if (!socketUser || typeof data?.roomId !== 'string' || data.roomId.length > 200) return;
            socket.to(data.roomId).emit('answer', { answer: data.answer, senderId: socket.id });
        });

        socket.on('ice-candidate', (data: { candidate: any; roomId: string }) => {
            if (!socketUser || typeof data?.roomId !== 'string' || data.roomId.length > 200) return;
            socket.to(data.roomId).emit('ice-candidate', { candidate: data.candidate, senderId: socket.id });
        });

        // ── Chat: join a group channel or DM room ─────────────
        socket.on('join-chat', (channel: string) => {
            if (!socketUser) {
                socket.emit('chat-error', { message: 'Authentication required' });
                return;
            }

            if (channel.startsWith('dm:')) {
                // DM channel — verify this user is one of the two participants
                const parts = channel.split(':');
                if (parts.length !== 3 || (parts[1] !== socketUser.id && parts[2] !== socketUser.id)) {
                    socket.emit('chat-error', { message: 'You are not a participant in this conversation' });
                    return;
                }
            } else if (!canJoinChannel(socketUser.role, channel)) {
                socket.emit('chat-error', { message: `You do not have access to the #${channel} channel` });
                return;
            }

            socket.join(`chat:${channel}`);
        });

        // ── Start or open a DM with another user ─────────────
        socket.on('start-dm', (targetUserId: string) => {
            if (!socketUser) {
                socket.emit('chat-error', { message: 'Authentication required' });
                return;
            }
            if (targetUserId === socketUser.id) {
                socket.emit('chat-error', { message: 'Cannot start a DM with yourself' });
                return;
            }
            const channel = dmChannel(socketUser.id, targetUserId);
            socket.join(`chat:${channel}`);
            socket.emit('dm-ready', { channel, targetUserId });
        });

        socket.on('send-message', async (data: {
            roomId: string;
            message: string;
            senderName: string;   // Still accepted for backwards-compat, but IGNORED server-side
            senderId: string;     // IGNORED — we use the JWT identity
        }) => {
            // ── Security: derive identity from JWT, not client payload ──
            if (!socketUser) {
                socket.emit('chat-error', { message: 'Authentication required to send messages' });
                return;
            }

            const channel = data.roomId;

            // ── Access control ──────────────────────────────────────────
            if (channel.startsWith('dm:')) {
                // DM — must be a participant
                const parts = channel.split(':');
                if (parts.length !== 3 || (parts[1] !== socketUser.id && parts[2] !== socketUser.id)) {
                    socket.emit('chat-error', { message: 'You are not a participant in this conversation' });
                    return;
                }
            } else if (!canJoinChannel(socketUser.role, channel)) {
                socket.emit('chat-error', { message: `You do not have permission to post in #${channel}` });
                return;
            }

            // ── Content validation ──────────────────────────────────────
            const content = typeof data.message === 'string' ? data.message.trim() : '';
            if (!content || content.length > 2000) {
                socket.emit('chat-error', { message: 'Invalid message content' });
                return;
            }

            // ── Persist ─────────────────────────────────────────────────
            let savedMessage: any = null;
            try {
                savedMessage = await prisma.message.create({
                    data: {
                        content,
                        senderId: socketUser.id,
                        channel
                    },
                    include: {
                        sender: { select: { firstName: true, lastName: true, role: true } }
                    }
                });
            } catch (err) {
                console.error('Error saving chat message:', err);
            }

            const payload = {
                message:    content,
                senderName: `${savedMessage?.sender?.firstName ?? 'Unknown'} ${savedMessage?.sender?.lastName ?? ''}`.trim(),
                senderId:   socketUser.id,
                senderRole: socketUser.role,
                roomId:     channel,
                timestamp:  savedMessage?.createdAt?.toISOString() ?? new Date().toISOString()
            };

            // Broadcast to the authenticated chat room (includes sender)
            io.to(`chat:${channel}`).emit('receive-message', payload);
        });

        socket.on('disconnect', () => {});
    });
};
