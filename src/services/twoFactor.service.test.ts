import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTwoFactorSecret,
  generateTwoFactorQRUrl,
  verifyTwoFactorCode,
  generateBackupCodes,
  verifyBackupCode,
} from '../services/twoFactor.service';

// These tests exercise the real otplib implementation rather than mocking it,
// so they validate actual TOTP behavior and the real return shapes used by the
// auth controller (boolean from verifyTwoFactorCode, { valid, remainingCodes }
// from verifyBackupCode).

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
    it('should generate an otpauth URL containing the issuer and account', () => {
      const secret = generateTwoFactorSecret();
      const email = 'test@example.com';

      const url = generateTwoFactorQRUrl(email, secret);
      expect(url).toContain('otpauth://totp/');
      expect(url).toContain('issuer=OltraHMS');
      expect(url).toContain(email);
      expect(url).toContain(secret);
    });
  });

  describe('verifyTwoFactorCode', () => {
    it('should verify a valid code', () => {
      const secret = generateTwoFactorSecret();
      const code = authenticator.generate(secret); // current valid TOTP

      const result = verifyTwoFactorCode(secret, code);
      expect(result).toBe(true);
    });

    it('should reject an invalid code', () => {
      const secret = generateTwoFactorSecret();

      const result = verifyTwoFactorCode(secret, '000000');
      expect(result).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes by default', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-F0-9]{8}$/);
      });
    });

    it('should honor a requested count', () => {
      expect(generateBackupCodes(5)).toHaveLength(5);
    });

    it('should generate unique codes', () => {
      const codes1 = generateBackupCodes();
      const codes2 = generateBackupCodes();
      expect(codes1).not.toEqual(codes2);
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify a valid backup code and consume it', () => {
      const codes = generateBackupCodes();
      const validCode = codes[0];

      const result = verifyBackupCode(validCode, codes);
      expect(result.valid).toBe(true);
      expect(result.remainingCodes).toHaveLength(codes.length - 1);
      expect(result.remainingCodes).not.toContain(validCode);
    });

    it('should reject an invalid backup code', () => {
      const codes = generateBackupCodes();

      const result = verifyBackupCode('00000000', codes);
      expect(result.valid).toBe(false);
      expect(result.remainingCodes).toHaveLength(codes.length);
    });

    it('should reject a used backup code on second attempt', () => {
      const codes = generateBackupCodes();
      const usedCode = codes[0];

      // First use consumes it
      const first = verifyBackupCode(usedCode, codes);
      expect(first.valid).toBe(true);

      // Re-checking against the remaining codes should fail
      const second = verifyBackupCode(usedCode, first.remainingCodes);
      expect(second.valid).toBe(false);
    });
  });
});
