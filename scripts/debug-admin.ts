
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@oltrahms.com';
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
    const isValid = await bcrypt.compare('OltraHMS@123', user.passwordHash);
    console.log(`Password 'OltraHMS@123' matches: ${isValid}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
