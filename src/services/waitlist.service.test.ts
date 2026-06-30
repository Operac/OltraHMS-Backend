import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for the external Google libraries. Built in vi.hoisted() so they
// exist before the (hoisted) vi.mock factories below reference them. Tests can
// reconfigure sheetMock.getRows / sheetMock.addRow per case.
const { sheetMock, docMock, GoogleSpreadsheetMock, JWTMock } = vi.hoisted(() => {
  const sheetMock = {
    getRows: vi.fn(),
    addRow: vi.fn(),
  };
  const docMock = {
    loadInfo: vi.fn(),
    sheetsByIndex: [sheetMock],
  };
  return {
    sheetMock,
    docMock,
    GoogleSpreadsheetMock: vi.fn(() => docMock),
    JWTMock: vi.fn(() => ({})),
  };
});

vi.mock('google-spreadsheet', () => ({ GoogleSpreadsheet: GoogleSpreadsheetMock }));
vi.mock('google-auth-library', () => ({ JWT: JWTMock }));

import { WaitlistService } from './waitlist.service';

const setValidCredentials = () => {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
  process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
  process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';
};

describe('WaitlistService', () => {
  let service: WaitlistService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock behavior (clearAllMocks keeps prior implementations,
    // so reassert defaults to avoid per-test overrides leaking).
    docMock.loadInfo.mockResolvedValue(undefined);
    sheetMock.getRows.mockResolvedValue([]);
    sheetMock.addRow.mockResolvedValue(undefined);
    GoogleSpreadsheetMock.mockImplementation(() => docMock);
    JWTMock.mockImplementation(() => ({}));

    service = new WaitlistService();
    setValidCredentials();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid credentials', async () => {
      await service.addToWaitlist({ name: 'John Doe', email: 'john@example.com' });
      expect((service as any).initialized).toBe(true);
      expect(GoogleSpreadsheetMock).toHaveBeenCalledWith('fake-sheet-id', expect.anything());
    });

    it('should handle missing credentials gracefully', async () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_PRIVATE_KEY;
      delete process.env.GOOGLE_SHEET_ID;

      const result = await service.addToWaitlist({ name: 'John Doe', email: 'john@example.com' });

      expect(result.success).toBe(true);
      expect(result.method).toBe('LOG'); // Should fall back to logging
    });
  });

  describe('addToWaitlist', () => {
    it('should normalize email to lowercase and trim whitespace', async () => {
      await service.addToWaitlist({
        name: 'John Doe',
        email: '  JOHN@EXAMPLE.COM  ',
        organization: '  Test Hospital  ',
        role: '  Doctor  ',
      });

      const addRowCall = sheetMock.addRow.mock.calls[0][0];
      expect(addRowCall.Email).toBe('john@example.com');
      expect(addRowCall.Organization).toBe('Test Hospital');
      expect(addRowCall.Role).toBe('Doctor');
    });

    it('should reject empty name or email', async () => {
      await expect(
        service.addToWaitlist({ name: '', email: 'test@example.com' })
      ).rejects.toThrow('Name and email are required');

      await expect(
        service.addToWaitlist({ name: 'John Doe', email: '' })
      ).rejects.toThrow('Name and email are required');
    });

    it('should prevent duplicate emails when Google Sheets is available', async () => {
      sheetMock.getRows.mockResolvedValue([{ Email: 'existing@example.com' }]);

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'EXISTING@EXAMPLE.COM', // Different case
        organization: 'Test Hospital',
        role: 'Doctor',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email already exists in waitlist');
      expect(result.method).toBe('DUPLICATE_PREVENTED');
      expect(sheetMock.addRow).not.toHaveBeenCalled();
    });

    it('should add new email when no duplicate found', async () => {
      sheetMock.getRows.mockResolvedValue([{ Email: 'other@example.com' }]);

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'new@example.com',
        organization: 'Test Hospital',
        role: 'Doctor',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('SHEET');
      expect(sheetMock.addRow).toHaveBeenCalledWith({
        Name: 'John Doe',
        Email: 'new@example.com',
        Organization: 'Test Hospital',
        Role: 'Doctor',
        Date: expect.any(String),
      });
    });

    it('should fall back to logging when Google Sheets fails', async () => {
      sheetMock.getRows.mockResolvedValue([]);
      sheetMock.addRow.mockRejectedValue(new Error('Sheet error'));

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.addToWaitlist({ name: 'John Doe', email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(result.method).toBe('LOG');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('WAITLIST ENTRY'));

      consoleLogSpy.mockRestore();
    });
  });
});
