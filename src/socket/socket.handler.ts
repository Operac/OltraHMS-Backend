import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

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

export const setupSocketHandlers = (io: any) => {
    // Set up namespace for queue events
    const queueNamespace = io.of('/queue');
    
    queueNamespace.on('connection', (socket: Socket) => {
        console.log('Queue client connected:', socket.id);
        
        // Join specific rooms
        socket.on('join-reception', () => {
            socket.join('reception');
            console.log('Client joined reception room');
        });
        
        socket.on('join-nurse-station', () => {
            socket.join('nurse-station');
            console.log('Client joined nurse station room');
        });
        
        socket.on('join-doctor', (doctorId: string) => {
            socket.join(`doctor-${doctorId}`);
            console.log(`Client joined doctor-${doctorId} room`);
        });
        
        socket.on('join-department', (departmentId: string) => {
            socket.join(`department-${departmentId}`);
        });
        
        socket.on('join-display', () => {
            socket.join('display');
            console.log('Client joined display room');
        });
        
        // Disconnect
        socket.on('disconnect', () => {
            console.log('Queue client disconnected:', socket.id);
        });
    });
    
    // Store reference for emitting events
    (global as any).queueIO = queueNamespace;
    
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

            // Use socket.to() to exclude sender - prevents duplicate messages
            socket.to(data.roomId).emit('receive-message', {
                message: data.message,
                senderName: data.senderName,
                senderId: data.senderId,
                timestamp: new Date().toISOString()
            });
        });

        // Leave
        socket.on('disconnect', () => {
        });
    });
};
