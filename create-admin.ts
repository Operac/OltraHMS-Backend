import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const password = process.env.ADMIN_PASSWORD || 'password123';
    const hash = await bcrypt.hash(password, 12);
    
    // Check if user already exists
    let existing = await prisma.user.findUnique({ where: { email: 'admin@oltrahms.com' } });
    if (existing) {
        await prisma.user.update({
            where: { email: 'admin@oltrahms.com' },
            data: { role: 'ADMIN', passwordHash: hash }
        });
        console.log("Updated existing admin user");
    } else {
        await prisma.user.create({
            data: {
                email: 'admin@oltrahms.com',
                passwordHash: hash,
                role: 'ADMIN',
                firstName: 'Oltra',
                lastName: 'Admin'
            }
        });
        console.log("Created new admin user");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
