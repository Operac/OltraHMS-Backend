import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WaitlistService } from './waitlist.service';

describe('WaitlistService', () => {
  let service: WaitlistService;

  beforeEach(() => {
    service = new WaitlistService();
    // Reset singleton state
    (service as any).doc = null;
    (service as any).initialized = false;
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid credentials', async () => {
      // Mock environment variables
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
      process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';

      // Mock GoogleSpreadsheet
      const mockSheet = {
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [{ addRow: vi.fn().mockResolvedValue(undefined) }]
      };
      const mockDoc = { 
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [mockSheet]
      };
      
      // Mock the module using vi.mocked
      vi.mocked('google-spreadsheet').mockReturnValue(mockDoc);

      await service.addToWaitlist({
        name: 'John Doe',
        email: 'john@example.com'
      });

      expect(service.initialized).toBe(true);
    });

    it('should handle missing credentials gracefully', async () => {
      // Remove credentials
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_PRIVATE_KEY;
      delete process.env.GOOGLE_SHEET_ID;

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'john@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('LOG'); // Should fall back to logging
    });
  });

  describe('addToWaitlist', () => {
    it('should normalize email to lowercase and trim whitespace', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
      process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';

      // Mock GoogleSpreadsheet
      const mockSheet = {
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [{ addRow: vi.fn().mockResolvedValue(undefined) }]
      };
      const mockDoc = { 
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [mockSheet]
      };
      
      // Mock the module
      vi.mocked('google-spreadsheet').mockReturnValue(mockDoc);

      await service.addToWaitlist({
        name: 'John Doe',
        email: '  JOHN@EXAMPLE.COM  ',
        organization: '  Test Hospital  ',
        role: '  Doctor  '
      });

      // Check that addRow was called with normalized data
      const addRowCall = mockSheet.sheetsByIndex[0].addRow.mock.calls[0][0];
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
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
      process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';

      const mockSheet = {
        loadInfo: vi.fn().mockResolvedValue(undefined),
        getRows: vi.fn().mockResolvedValue([
          { Email: 'existing@example.com' }
        ]),
        sheetsByIndex: [{ addRow: vi.fn().mockResolvedValue(undefined) }]
      };
      const mockDoc = { 
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [mockSheet]
      };
      
      // Mock the module
      vi.mocked('google-spreadsheet').mockReturnValue(mockDoc);

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'EXISTING@EXAMPLE.COM', // Different case
        organization: 'Test Hospital',
        role: 'Doctor'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email already exists in waitlist');
      expect(result.method).toBe('DUPLICATE_PREVENTED');
      
      // Should NOT have called addRow
      expect(mockSheet.sheetsByIndex[0].addRow).not.toHaveBeenCalled();
    });

    it('should add new email when no duplicate found', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
      process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';

      const mockSheet = {
        loadInfo: vi.fn().mockResolvedValue(undefined),
        getRows: vi.fn().mockResolvedValue([
          { Email: 'other@example.com' }
        ]),
        sheetsByIndex: [{ addRow: vi.fn().mockResolvedValue(undefined) }]
      };
      const mockDoc = { 
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [mockSheet]
      };
      
      // Mock the module
      vi.mocked('google-spreadsheet').mockReturnValue(mockDoc);

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'new@example.com',
        organization: 'Test Hospital',
        role: 'Doctor'
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('SHEET');
      expect(mockSheet.sheetsByIndex[0].addRow).toHaveBeenCalledWith({
        Name: 'John Doe',
        Email: 'new@example.com',
        Organization: 'Test Hospital',
        Role: 'Doctor',
        Date: expect.any(String)
      });
    });

    it('should fall back to logging when Google Sheets fails', async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';
      process.env.GOOGLE_SHEET_ID = 'fake-sheet-id';

      // Mock initialization to succeed but sheet operations to fail
      const mockSheet = {
        loadInfo: vi.fn().mockResolvedValue(undefined),
        getRows: vi.fn().mockResolvedValue([]),
        sheetsByIndex: [{ 
          addRow: vi.fn().mockRejectedValue(new Error('Sheet error')) 
        }]
      };
      const mockDoc = { 
        loadInfo: vi.fn().mockResolvedValue(undefined),
        sheetsByIndex: [mockSheet]
      };
      
      // Mock the module
      vi.mocked('google-spreadsheet').mockReturnValue(mockDoc);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.addToWaitlist({
        name: 'John Doe',
        email: 'test@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('LOG');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('WAITLIST ENTRY')
      );

      consoleLogSpy.mockRestore();
    });
  });
});