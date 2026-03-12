import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    generate: vi.fn().mockReturnValue('123456'),
    verify: vi.fn().mockReturnValue({ delta: 0 }),
    keyuri: vi.fn().mockReturnValue('otpauth://totp/test?secret=JBSWY3DPEHPK3PXP'),
  },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

import { 
  generateTwoFactorSecret, 
  generateTwoFactorQRUrl, 
  verifyTwoFactorCode,
  generateBackupCodes,
  verifyBackupCode 
} from '../services/twoFactor.service';

describe('TwoFactor Service', () => {
  describe('generateTwoFactorSecret', () => {
    it('should generate a secret', () => {
      const secret = generateTwoFactorSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(10);
    });
  });

  describe('generateTwoFactorQRUrl', () => {
    it('should generate a QR code URL', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const email = 'test@example.com';
      
      const url = await generateTwoFactorQRUrl(email, secret);
      expect(url).toContain('otpauth://totp/');
      expect(url).toContain(encodeURIComponent(email));
    });
  });

  describe('verifyTwoFactorCode', () => {
    it('should verify a valid code', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = '123456';
      
      const result = verifyTwoFactorCode(secret, code);
      expect(result).toBe(true);
    });

    it('should reject an invalid code', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = '000000';
      
      const result = verifyTwoFactorCode(secret, code);
      expect(result).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 8 backup codes', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(8);
      codes.forEach(code => {
        expect(code).toMatch(/^[a-f0-9]{8}$/);
      });
    });

    it('should generate unique codes', () => {
      const codes1 = generateBackupCodes();
      const codes2 = generateBackupCodes();
      expect(codes1).not.toEqual(codes2);
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify a valid backup code', () => {
      const codes = generateBackupCodes();
      const validCode: string = codes[0];
      
      const result = verifyBackupCode(validCode, codes);
      expect(result).toBe(true);
    });

    it('should reject an invalid backup code', () => {
      const codes = generateBackupCodes();
      
      const result = verifyBackupCode('00000000', codes);
      expect(result).toBe(false);
    });

    it('should reject used backup code', () => {
      const codes = generateBackupCodes();
      const usedCode: string = codes[0];
      
      // Use the code
      verifyBackupCode(usedCode, codes);
      
      // Try to use again
      const result = verifyBackupCode(usedCode, codes);
      expect(result).toBe(false);
    });
  });
});
