import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, Status } from '@prisma/client';
import { z } from 'zod';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.service';
import { logAudit } from '../services/audit.service';

import { prisma } from '../lib/prisma';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
  role: z.nativeEnum(Role).optional(),
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role } = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: role || Role.PATIENT,
        status: Status.ACTIVE,
      },
    });

    await sendWelcomeEmail(user.email, user.firstName || 'User');
    await logAudit(user.id, 'USER_REGISTER', 'User registered successfully', req.ip || 'unknown');

    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        return res.status(403).json({ message: 'Account is locked. Try again later.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
        const attempts = user.failedLoginAttempts + 1;
        let lockoutUntil = user.lockoutUntil;
        
        if (attempts >= 5) {
            lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts, lockoutUntil }
        });

        return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Reset lockout on success
    await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null, lastLogin: new Date() }
    });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is not defined");

    const refreshSecret = process.env.REFRESH_SECRET;
    if (!refreshSecret) throw new Error("REFRESH_SECRET is not defined");

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        { id: user.id },
        refreshSecret,
        { expiresIn: '7d' }
    );

    // Store refresh token logic here if needed

    await logAudit(user.id, 'USER_LOGIN', 'Login successful', req.ip || 'unknown');

    // Fetch Staff ID if applicable
    const staff = await prisma.staff.findUnique({ where: { userId: user.id } });

    res.json({ 
        token, 
        refreshToken, 
        user: { 
            id: user.id, 
            email: user.email, 
            role: user.role, 
            firstName: user.firstName,
            staffId: staff?.id 
        } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error });
  }
};

export const resetPasswordRequest = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        
        // Save token to DB ? Or just statless verify. 
        // Better to save hash of token to invalidate used ones, but strictly verifying signature works for MVP.
        // We added resetToken to schema, so let's use it.
        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 3600000) }
        });

        await sendPasswordResetEmail(user.email, token);
        await sendPasswordResetEmail(user.email, token);
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending reset email' });
    }
}

const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(), // If we add phone to User model or map to Patient/Staff
});

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const data = updateProfileSchema.parse(req.body);

        // Check email uniqueness if email is being updated
        if (data.email) {
            const existing = await prisma.user.findUnique({ where: { email: data.email } });
            if (existing && existing.id !== userId) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                // phone // User model doesn't have phone, check Patient/Staff if needed.
                // For MVP, assuming User model only has basic details. 
            }
        });

        // If user is Patient, maybe update Patient phone?
        // Not implemented here to keep simple.

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                role: updatedUser.role
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
             return res.status(400).json({ message: 'Validation error', errors: error.issues });
        }
        res.status(500).json({ message: 'Failed to update profile', error });
    }
};
