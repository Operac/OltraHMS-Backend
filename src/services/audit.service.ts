import { Request } from 'express';
import { prisma } from '../lib/prisma';

// Audit action types - using object instead of enum for flexibility
export const AuditAction = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  TWO_FA_SETUP: 'TWO_FA_SETUP',
  TWO_FA_ENABLE: 'TWO_FA_ENABLE',
  TWO_FA_DISABLE: 'TWO_FA_DISABLE',
  
  // Patient
  PATIENT_CREATE: 'PATIENT_CREATE',
  PATIENT_UPDATE: 'PATIENT_UPDATE',
  PATIENT_DELETE: 'PATIENT_DELETE',
  PATIENT_VIEW: 'PATIENT_VIEW',
  
  // Appointments
  APPOINTMENT_CREATE: 'APPOINTMENT_CREATE',
  APPOINTMENT_UPDATE: 'APPOINTMENT_UPDATE',
  APPOINTMENT_CANCEL: 'APPOINTMENT_CANCEL',
  APPOINTMENT_COMPLETE: 'APPOINTMENT_COMPLETE',
  
  // Medical Records
  RECORD_CREATE: 'RECORD_CREATE',
  RECORD_UPDATE: 'RECORD_UPDATE',
  RECORD_VIEW: 'RECORD_VIEW',
  
  // Prescriptions
  PRESCRIPTION_CREATE: 'PRESCRIPTION_CREATE',
  PRESCRIPTION_UPDATE: 'PRESCRIPTION_UPDATE',
  PRESCRIPTION_VIEW: 'PRESCRIPTION_VIEW',
  
  // Billing
  BILLING_CREATE: 'BILLING_CREATE',
  BILLING_UPDATE: 'BILLING_UPDATE',
  PAYMENT_PROCESSED: 'PAYMENT_PROCESSED',
  
  // Staff
  STAFF_CREATE: 'STAFF_CREATE',
  STAFF_UPDATE: 'STAFF_UPDATE',
  STAFF_DELETE: 'STAFF_DELETE',
  
  // Admin
  DEPARTMENT_CREATE: 'DEPARTMENT_CREATE',
  DEPARTMENT_UPDATE: 'DEPARTMENT_UPDATE',
  DEPARTMENT_DELETE: 'DEPARTMENT_DELETE',
  SYSTEM_CONFIG_CHANGE: 'SYSTEM_CONFIG_CHANGE',
  
  // Data Export
  DATA_EXPORT: 'DATA_EXPORT',
  REPORT_GENERATE: 'REPORT_GENERATE',
} as const;

// Helper to extract IP from request
export function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// Basic audit log function
export const logAudit = async (
  userId: string,
  action: string,
  details: string,
  ipAddress: string
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
        ipAddress,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};
