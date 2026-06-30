import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, Status, Gender } from '@prisma/client';
import { z } from 'zod';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.service';
import { logAudit } from '../services/audit.service';
import { generateTwoFactorSecret, generateTwoFactorQRUrl, verifyTwoFactorCode, generateBackupCodes, verifyBackupCode } from '../services/twoFactor.service';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

import { prisma } from '../lib/prisma';

const getEncryptionKey = (): Buffer => {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error("ENCRYPTION_SECRET environment variable is required for 2FA");
    }
    if (/^[a-f0-9]{64}$/i.test(secret)) {
        return Buffer.from(secret, 'hex');
    }
    return createHash('sha256').update(secret).digest();
};

const encryptSecret = (secret: string): string => {
    const key = getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

const decryptSecret = (encryptedSecret: string): string => {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = encryptedSecret.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.string().optional(),
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = registerSchema.parse(req.body);

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
        role: Role.PATIENT,
        status: Status.ACTIVE,
      },
    });

    if (user.role === Role.PATIENT) {
        const patientNumber = `HMS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        
        await prisma.patient.create({
            data: {
                userId: user.id,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                patientNumber,
                dateOfBirth: new Date(req.body.dateOfBirth || new Date().toISOString()),
                gender: req.body.gender as Gender || Gender.OTHER,
                phone: req.body.phone || '000-000-0000',
            }
        });
    }

    // FIX: wrap email and audit in try/catch so they never kill registration
    // if email service is down or misconfigured, user still gets their token
    try {
        await sendWelcomeEmail(user.email, user.firstName || 'User');
    } catch (emailError) {
        console.error('Welcome email failed (non-fatal):', emailError);
    }

    try {
        await logAudit(user.id, 'USER_REGISTER', 'User registered successfully', req.ip || 'unknown');
    } catch (auditError) {
        console.error('Audit log failed (non-fatal):', auditError);
    }

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

    const staff = await prisma.staff.findUnique({ where: { userId: user.id } });

    res.status(201).json({ 
      token, 
      refreshToken, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        firstName: user.firstName,
        lastName: user.lastName,
        staffId: staff?.id 
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Email and password are required' });
    }

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
            lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts, lockoutUntil }
        });

        return res.status(401).json({ message: 'Invalid credentials' });
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null, lastLogin: new Date() }
    });

    // If 2FA is enabled, require OTP before issuing full token
    if (user.twoFactorEnabled && user.twoFactorSecret) {
        const { twoFactorCode } = req.body;
        if (!twoFactorCode) {
            return res.status(200).json({ requiresTwoFactor: true, userId: user.id });
        }
        const decryptedSecret = decryptSecret(user.twoFactorSecret);
        const isValidOTP = verifyTwoFactorCode(decryptedSecret, twoFactorCode);
        if (!isValidOTP) {
            // Check backup codes
            const storedCodes = user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes) : [];
            const backupResult = verifyBackupCode(twoFactorCode, storedCodes);
            if (!backupResult.valid) {
                return res.status(401).json({ message: 'Invalid 2FA code' });
            }
            await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorBackupCodes: JSON.stringify(backupResult.remainingCodes) }
            });
        }
    }

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

    try {
        await logAudit(user.id, 'USER_LOGIN', 'Login successful', req.ip || 'unknown');
    } catch (auditError) {
        console.error('Audit log failed (non-fatal):', auditError);
    }

    const staff = await prisma.staff.findUnique({ where: { userId: user.id } });

    res.json({ 
        token, 
        refreshToken, 
        user: { 
            id: user.id, 
            email: user.email, 
            role: user.role, 
            firstName: user.firstName,
            lastName: user.lastName,
            staffId: staff?.id 
        } 
    });
  } catch (error) {
    console.error('Login error details:', error);
    res.status(500).json({ 
        message: 'Login failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const refreshSecret = process.env.REFRESH_SECRET;
    if (!refreshSecret) throw new Error("REFRESH_SECRET is not defined");

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Re-fetch the user so role/lockout changes take effect on refresh
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return res.status(403).json({ message: 'Account is locked' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is not defined");

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '15m' }
    );

    // Rotate the refresh token so a stolen one has a bounded lifetime
    const newRefreshToken = jwt.sign(
      { id: user.id },
      refreshSecret,
      { expiresIn: '7d' }
    );

    res.json({ token, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Token refresh failed' });
  }
};

export const resetPasswordRequest = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                resetToken: token, 
                resetTokenExpiry: new Date(Date.now() + 3600000),
                lastResetIp: clientIp
            }
        });

        await sendPasswordResetEmail(user.email, token);
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending reset email' });
    }
}

export const resetPasswordConfirm = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        if (user.lastResetIp) {
            const currentIp = req.ip || req.socket.remoteAddress || 'unknown';
            if (currentIp !== user.lastResetIp) {
                console.warn(`Password reset IP mismatch: stored=${user.lastResetIp}, current=${currentIp}`);
            }
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                resetToken: null,
                resetTokenExpiry: null,
                lastResetIp: null
            }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: 'Error resetting password' });
    }
}

export const setupTwoFactor = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: '2FA is already enabled' });
        }

        const secret = generateTwoFactorSecret();
        const qrUrl = generateTwoFactorQRUrl(user.email, secret);

        const encryptedSecret = encryptSecret(secret);
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: encryptedSecret }
        });

        res.json({
            message: '2FA setup initiated',
            secret,
            qrUrl
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ message: 'Error setting up 2FA' });
    }
}

export const enableTwoFactor = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { code } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!code) {
            return res.status(400).json({ message: 'Verification code is required' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorSecret) {
            return res.status(400).json({ message: 'Please setup 2FA first' });
        }

        const decryptedSecret = decryptSecret(user.twoFactorSecret);
        
        const isValid = verifyTwoFactorCode(decryptedSecret, code);
        if (!isValid) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        const backupCodes = generateBackupCodes(10);
        const encryptedSecret = encryptSecret(user.twoFactorSecret);

        await prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: true,
                twoFactorBackupCodes: JSON.stringify(backupCodes),
                twoFactorSecret: encryptedSecret
            }
        });

        res.json({
            message: '2FA enabled successfully',
            backupCodes
        });
    } catch (error) {
        console.error('2FA enable error:', error);
        res.status(500).json({ message: 'Error enabling 2FA' });
    }
}

export const disableTwoFactor = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { password, code } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorEnabled) {
            return res.status(400).json({ message: '2FA is not enabled' });
        }

        const isValidPassword = await bcrypt.compare(password || '', user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        const storedCodes = user.twoFactorBackupCodes 
            ? JSON.parse(user.twoFactorBackupCodes) 
            : [];
        
        const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : '';
        
        const isValidCode = verifyTwoFactorCode(decryptedSecret, code);
        const backupResult = verifyBackupCode(code || '', storedCodes);

        if (!isValidCode && !backupResult.valid) {
            return res.status(401).json({ message: 'Invalid verification code' });
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: false,
                twoFactorSecret: null,
                twoFactorBackupCodes: null
            }
        });

        res.json({ message: '2FA disabled successfully' });
    } catch (error) {
        console.error('2FA disable error:', error);
        res.status(500).json({ message: 'Error disabling 2FA' });
    }
}

export const verifyTwoFactor = async (req: Request, res: Response) => {
    try {
        const { userId, code, isBackupCode } = req.body;

        if (!userId || !code) {
            return res.status(400).json({ message: 'User ID and code are required' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorEnabled) {
            return res.status(400).json({ message: '2FA is not enabled' });
        }

        if (!isBackupCode) {
            const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : '';
            const isValid = verifyTwoFactorCode(decryptedSecret, code);
            if (isValid) {
                return res.json({ valid: true });
            }
        }

        const storedCodes = user.twoFactorBackupCodes 
            ? JSON.parse(user.twoFactorBackupCodes) 
            : [];
        
        const backupResult = verifyBackupCode(code, storedCodes);

        if (backupResult.valid) {
            await prisma.user.update({
                where: { id: userId },
                data: { 
                    twoFactorBackupCodes: JSON.stringify(backupResult.remainingCodes) 
                }
            });
            return res.json({ valid: true, usedBackupCode: true });
        }

        res.status(401).json({ valid: false, message: 'Invalid code' });
    } catch (error) {
        console.error('2FA verification error:', error);
        res.status(500).json({ message: 'Error verifying 2FA' });
    }
}

export const getTwoFactorStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
        res.json({ twoFactorEnabled: user?.twoFactorEnabled || false });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching 2FA status' });
    }
};

const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const data = updateProfileSchema.parse(req.body);

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
            }
        });

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
        res.status(500).json({ message: 'Failed to update profile' });
    }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || !user.passwordHash) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValidPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Failed to change password' });
    }
};