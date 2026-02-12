import { prisma } from '../lib/prisma';
import { NotificationChannel, NotificationPriority } from '@prisma/client';

export const NotificationService = {
  /**
   * Send a notification to a user.
   * Handles In-App DB creation and "Simulates" external providers (WhatsApp/SMS).
   */
  send: async (
    userId: string,
    message: string,
    channels: NotificationChannel[] = ['IN_APP'],
    priority: NotificationPriority = 'MEDIUM'
  ) => {
    try {
      // 1. Create In-App Notification (Always, if requested)
      if (channels.includes('IN_APP')) {
        await prisma.notification.create({
          data: {
            userId,
            message,
            channel: 'IN_APP',
            priority,
            status: 'SENT'
          }
        });
      }

      // 2. Simulate External Channels
      // In a real app, successful API call -> 'SENT', fail -> 'FAILED'
      channels.forEach(channel => {
        if (channel === 'WHATSAPP') {
          console.log(`[📱 WHATSAPP] To User ${userId}: ${message}`);
        }
        if (channel === 'SMS') {
          console.log(`[💬 SMS] To User ${userId}: ${message}`);
        }
        if (channel === 'EMAIL') {
          console.log(`[📧 EMAIL] To User ${userId}: ${message}`);
        }
      });

      return true;
    } catch (error) {
      console.error('Notification Error:', error);
      return false;
    }
  },

  /**
   * Helper for System Alerts
   */
  sendSystemAlert: async (userId: string, message: string) => {
    return NotificationService.send(userId, message, ['IN_APP'], 'HIGH');
  },

  /**
   * Helper for Telemedicine Invites
   */
  sendTelemedicineInvite: async (userId: string, link: string) => {
    const message = `Your consultation is ready. Join here: ${link}`;
    return NotificationService.send(userId, message, ['IN_APP', 'WHATSAPP'], 'HIGH');
  }
};
