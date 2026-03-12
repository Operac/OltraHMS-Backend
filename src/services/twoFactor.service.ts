import { authenticator } from 'otplib';
import * as crypto from 'crypto';

// Generate a secret for 2FA setup
export const generateTwoFactorSecret = (): string => {
  return authenticator.generateSecret();
};

// Generate a QR code URL for authenticator apps
export const generateTwoFactorQRUrl = (email: string, secret: string): string => {
  return authenticator.keyuri(email, 'OltraHMS', secret);
};

// Verify a TOTP code
export const verifyTwoFactorCode = (secret: string, code: string): boolean => {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
};

// Generate backup codes for 2FA recovery
export const generateBackupCodes = (count: number = 10): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
};

// Verify a backup code
export const verifyBackupCode = (
  providedCode: string,
  storedCodes: string[]
): { valid: boolean; remainingCodes: string[] } => {
  const codes = storedCodes || [];
  const normalizedProvided = providedCode.toUpperCase();
  
  const index = codes.findIndex(code => code === normalizedProvided);
  
  if (index === -1) {
    return { valid: false, remainingCodes: codes };
  }
  
  // Remove used backup code
  const remainingCodes = codes.filter((_, i) => i !== index);
  
  return { valid: true, remainingCodes };
};

// Encrypt 2FA secret for storage
export const encryptSecret = (secret: string, key: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt 2FA secret
export const decryptSecret = (encryptedData: string, key: string): string => {
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
