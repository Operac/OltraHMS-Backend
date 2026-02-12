// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Upsert Patient
  const patientUser = await prisma.user.upsert({
    where: { email: 'john.doe@example.com' },
    update: {},
    create: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      passwordHash: hashedPassword,
      role: 'PATIENT',
      status: 'ACTIVE'
    }
  });

  const patientProfile = await prisma.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: {
      userId: patientUser.id,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'MALE',
      phone: '1234567890',
      patientNumber: `HMS-${Date.now()}`,
      address: '123 Test St',
      bloodGroup: 'O_POSITIVE',
      genotype: 'AA'
    }
  });

  console.log({ patientUser });

  // 2. Upsert Doctor
  const doctorUser = await prisma.user.upsert({
    where: { email: 'jane.smith@example.com' },
    update: {},
    create: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      passwordHash: hashedPassword,
      role: 'DOCTOR',
      status: 'ACTIVE'
    }
  });

  const doctorProfile = await prisma.staff.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      userId: doctorUser.id,
      staffNumber: `DOC-${Date.now()}`,
      specialization: 'General Practitioner',
      departmentId: null,
      hireDate: new Date(),
      employmentStatus: 'ACTIVE'
    }
  });

  console.log({ doctorUser });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
