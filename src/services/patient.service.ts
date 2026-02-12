import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const generatePatientId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `HMS-${currentYear}-`;

  // Find the last patient created in the current year
  const lastPatient = await prisma.patient.findFirst({
    where: {
      patientNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      patientNumber: 'desc',
    },
  });

  let nextSequence = 1;

  if (lastPatient) {
    const lastSequenceStr = lastPatient.patientNumber.split('-')[2];
    const lastSequence = parseInt(lastSequenceStr, 10);
    if (!isNaN(lastSequence)) {
      nextSequence = lastSequence + 1;
    }
  }

  // Pad with leading zeros (e.g., 000001)
  const sequenceStr = nextSequence.toString().padStart(6, '0');
  return `${prefix}${sequenceStr}`;
};
