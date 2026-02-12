import { PrismaClient } from '@prisma/client';

console.log('🔌 Initializing PrismaClient...');
console.log('   -> DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');

export const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});
