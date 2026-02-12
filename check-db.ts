import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

console.log('🔌 Check DB Script Starting...');
console.log('   -> DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to Database!');
    const count = await prisma.user.count();
    console.log(`   -> Found ${count} users.`);
    await prisma.$disconnect();
  } catch (e) {
    console.error('❌ Connection Failed:', e);
    process.exit(1);
  }
}

main();
