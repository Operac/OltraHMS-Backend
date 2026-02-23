import { PrismaClient, Role, Status } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'accountant@oltrahms.com';
  const password = 'OltraHMS@123';
  const passwordHash = await bcrypt.hash(password, 12);

  console.log(`Creating accountant user: ${email}`);

  // Check if exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Accountant already exists.');
    return;
  }

  // Create User
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Oscar',
      lastName: 'Martinez',
      role: Role.ACCOUNTANT,
      status: Status.ACTIVE,
      passwordHash,
    },
  });

  // Create Staff content if needed (optional based on schema, but good for completeness)
  // Need to find or create a department 'Finance' or use General
  let dept = await prisma.department.findFirst({ where: { name: 'Finance' } });
  if (!dept) {
      dept = await prisma.department.create({
          data: { name: 'Finance', description: 'Finance Department' }
      });
      console.log('Created Finance Department');
  }

  await prisma.staff.create({
    data: {
      userId: user.id,
      staffNumber: 'FIN-001',
      specialization: 'Accounting',
      departmentId: dept.id,
      hireDate: new Date(),
    },
  });

  console.log(`✅ Created Accountant: ${user.firstName} ${user.lastName} (${user.email})`);
}

// Check env
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is NOT defined in this script context!');
} else {
    console.log('✅ JWT_SECRET is present.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
