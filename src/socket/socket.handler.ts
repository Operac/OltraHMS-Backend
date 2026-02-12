import { Server, Socket } from 'socket.io';

export const setupSocketHandlers = (io: any) => {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Join Room
        socket.on('join-room', (roomId: string) => {
            socket.join(roomId);
            console.log(`👤 User joined room: ${roomId}`);
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
        socket.on('send-message', (data: { roomId: string, message: string, senderName: string }) => {
            io.to(data.roomId).emit('receive-message', {
                message: data.message,
                senderName: data.senderName,
                timestamp: new Date().toISOString()
            });
        });

        // Leave
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
};
