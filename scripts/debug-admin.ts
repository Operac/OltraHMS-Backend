
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@oltrahms.com';
  const password = process.env.SCRIPT_PASSWORD;
  if (!password) {
    throw new Error('SCRIPT_PASSWORD must be set');
  }
  console.log(`Checking user: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log('❌ User not found in database.');
  } else {
    console.log('✅ User found:');
    console.log(`ID: ${user.id}`);
    console.log(`Role: ${user.role}`);
    console.log(`Status: ${user.status}`);
    console.log(`Password Hash exists: ${!!user.passwordHash}`);
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log(`Supplied password matches: ${isValid}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
