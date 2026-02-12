import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
