
import { Queue } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

export const emailQueue = new Queue('email-queue', { connection });
export const notificationQueue = new Queue('notification-queue', { connection });
