
import { PrismaClient, Role, Status } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating Lab user...');
  
  const email = 'lab@oltrahms.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  
  if (existing) {
      console.log('User already exists');
      return;
  }

  const passwordHash = await bcrypt.hash('OltraHMS@123', 12);

  const labTechUser = await prisma.user.create({
    data: {
      email,
      firstName: 'Dexter',
      lastName: 'Morgan',
      role: Role.LAB_TECH,
      status: Status.ACTIVE,
      passwordHash
    }
  });

  await prisma.staff.create({
    data: {
        userId: labTechUser.id,
        staffNumber: 'LAB-2025-001',
        specialization: 'Pathology',
        departmentId: 'Laboratory',
        hireDate: new Date(),
    }
  });
  console.log('✅ Created Lab Tech: Dexter Morgan (lab@oltrahms.com / OltraHMS@123)');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
