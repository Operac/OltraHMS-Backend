import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Connected successfully!');
    
    const userCount = await prisma.user.count();
    console.log(`User count: ${userCount}`);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Database connection failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
