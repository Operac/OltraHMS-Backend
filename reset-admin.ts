import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
        console.log("No admin found.");
        return;
    }
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 12) {
        throw new Error('ADMIN_PASSWORD must be set and contain at least 12 characters');
    }
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: hash, failedLoginAttempts: 0, lockoutUntil: null }
    });
    console.log(`Admin password reset for: ${admin.email}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
