import { PrismaClient } from '@prisma/client';

console.log('🔌 Initializing PrismaClient...');
console.log('   -> DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');

// Verbose query logging is useful in development but is heavy I/O (and leaks SQL
// into logs) under production load — keep it to warnings/errors there.
export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? ['warn', 'error']
        : ['query', 'info', 'warn', 'error'],
});
