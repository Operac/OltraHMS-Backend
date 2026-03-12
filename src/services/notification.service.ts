import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

/**
 * WebSocket Notification Service
 * Provides real-time notifications for appointments, messages, and alerts
 */

// Backward compatibility class
export class NotificationService {
  static sendTelemedicineInvite(participantId: string, sessionUrl: string): void {
    sendToUser(participantId, {
      type: 'appointment',
      title: 'Telemedicine Session Ready',
      message: `Your telemedicine session is ready. Join at: ${sessionUrl}`,
      data: { sessionUrl },
    });
  }
}

interface Notification {
  id: string;
  type: 'appointment' | 'message' | 'alert' | 'system';
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: Date;
  read: boolean;
}

interface UserSocket {
  userId: string;
  socketId: string;
}

// Store connected users
const connectedUsers: Map<string, UserSocket> = new Map();

let io: SocketServer | null = null;

/**
 * Initialize Socket.IO server
 */
export function initializeSocket(server: HTTPServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Handle user authentication
    socket.on('authenticate', (userId: string) => {
      connectedUsers.set(userId, { userId, socketId: socket.id });
      socket.join(`user:${userId}`);
      console.log(`User ${userId} authenticated on socket ${socket.id}`);
    });

    // Handle joining role-based rooms
    socket.on('joinRoom', (room: string) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    // Handle leaving rooms
    socket.on('leaveRoom', (room: string) => {
      socket.leave(room);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove user from connected users
      for (const [userId, userSocket] of connectedUsers.entries()) {
        if (userSocket.socketId === socket.id) {
          connectedUsers.delete(userId);
          console.log(`User ${userId} disconnected`);
          break;
        }
      }
    });

    // Handle ping for keepalive
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  return io;
}

/**
 * Get Socket.IO instance
 */
export function getIO(): SocketServer | null {
  return io;
}

/**
 * Send notification to a specific user
 */
export function sendToUser(userId: string, notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
  if (!io) {
    console.error('Socket.IO not initialized');
    return;
  }

  const fullNotification: Notification = {
    ...notification,
    id: generateId(),
    timestamp: new Date(),
    read: false,
  };

  io.to(`user:${userId}`).emit('notification', fullNotification);
  console.log(`Notification sent to user ${userId}: ${notification.title}`);
}

/**
 * Send notification to multiple users
 */
export function sendToUsers(userIds: string[], notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
  userIds.forEach(userId => sendToUser(userId, notification));
}

/**
 * Send notification to a role-based room
 */
export function sendToRole(role: string, notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
  if (!io) {
    console.error('Socket.IO not initialized');
    return;
  }

  const fullNotification: Notification = {
    ...notification,
    id: generateId(),
    timestamp: new Date(),
    read: false,
  };

  io.to(`role:${role}`).emit('notification', fullNotification);
  console.log(`Notification sent to role ${role}: ${notification.title}`);
}

/**
 * Send appointment notification
 */
export function notifyAppointment(appointment: {
  id: string;
  patientId: string;
  doctorId: string;
  type: string;
  dateTime: Date;
  status: string;
}): void {
  const statusMessages: Record<string, string> = {
    CONFIRMED: 'Appointment confirmed',
    CANCELLED: 'Appointment cancelled',
    COMPLETED: 'Appointment completed',
    REQUESTED: 'New appointment request',
  };

  const message = statusMessages[appointment.status] || 'Appointment updated';

  // Notify patient
  sendToUser(appointment.patientId, {
    type: 'appointment',
    title: 'Appointment Update',
    message: `Your appointment on ${new Date(appointment.dateTime).toLocaleDateString()} has been ${appointment.status.toLowerCase()}`,
    data: { appointmentId: appointment.id },
  });

  // Notify doctor
  sendToUser(appointment.doctorId, {
    type: 'appointment',
    title: 'Appointment Update',
    message: `Appointment ${appointment.status.toLowerCase()} for ${new Date(appointment.dateTime).toLocaleDateString()}`,
    data: { appointmentId: appointment.id },
  });
}

/**
 * Send new message notification
 */
export function notifyNewMessage(recipientId: string, senderName: string, conversationId: string): void {
  sendToUser(recipientId, {
    type: 'message',
    title: 'New Message',
    message: `You have a new message from ${senderName}`,
    data: { conversationId },
  });
}

/**
 * Send lab result notification
 */
export function notifyLabResult(patientId: string, testName: string, resultId: string): void {
  sendToUser(patientId, {
    type: 'alert',
    title: 'Lab Results Ready',
    message: `Your ${testName} results are now available`,
    data: { resultId },
  });
}

/**
 * Send prescription notification
 */
export function notifyPrescription(patientId: string, doctorName: string, prescriptionId: string): void {
  sendToUser(patientId, {
    type: 'alert',
    title: 'New Prescription',
    message: `Dr. ${doctorName} has prescribed new medication for you`,
    data: { prescriptionId },
  });
}

/**
 * Broadcast system-wide notification
 */
export function broadcastNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
  if (!io) {
    console.error('Socket.IO not initialized');
    return;
  }

  const fullNotification: Notification = {
    ...notification,
    id: generateId(),
    timestamp: new Date(),
    read: false,
  };

  io.emit('systemNotification', fullNotification);
}

/**
 * Get connected users count
 */
export function getConnectedUsersCount(): number {
  return connectedUsers.size;
}

/**
 * Check if user is online
 */
export function isUserOnline(userId: string): boolean {
  return connectedUsers.has(userId);
}

// Helper function to generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
