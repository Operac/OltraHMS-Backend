import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

export const setupSocketHandlers = (io: any) => {
    io.on('connection', (socket: Socket) => {

        // Join Room
        socket.on('join-room', (roomId: string) => {
            socket.join(roomId);
            // Notify others in room
            socket.to(roomId).emit('user-connected', socket.id);
        });

        // Signaling: Offer
        socket.on('offer', (data: { offer: any, roomId: string }) => {
            socket.to(data.roomId).emit('offer', { offer: data.offer, senderId: socket.id });
        });

        // Signaling: Answer
        socket.on('answer', (data: { answer: any, roomId: string }) => {
            socket.to(data.roomId).emit('answer', { answer: data.answer, senderId: socket.id });
        });

        // Signaling: ICE Candidate
        socket.on('ice-candidate', (data: { candidate: any, roomId: string }) => {
            socket.to(data.roomId).emit('ice-candidate', { candidate: data.candidate, senderId: socket.id });
        });

        // Chat
        socket.on('send-message', async (data: { roomId: string, message: string, senderName: string, senderId: string }) => {
            // Save to DB
            try {
                if (data.senderId) {
                    await prisma.message.create({
                        data: {
                            content: data.message,
                            senderId: data.senderId,
                            channel: data.roomId
                        }
                    });
                }
            } catch (err) {
                console.error('Error saving message:', err);
            }

            io.to(data.roomId).emit('receive-message', {
                message: data.message,
                senderName: data.senderName,
                timestamp: new Date().toISOString()
            });
        });

        // Leave
        socket.on('disconnect', () => {
        });
    });
};
