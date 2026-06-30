import { describe, it, expect, beforeEach, vi } from 'vitest';
import { joinWaitlist } from './public.controller';
import { waitlistService } from '../services/waitlist.service';
import { Request, Response } from 'express';

// Mock the waitlist service (project runs Vitest, not Jest)
vi.mock('../services/waitlist.service', () => ({
  waitlistService: { addToWaitlist: vi.fn() },
}));

// Mock the audit service so the success path doesn't touch the real database
// (logAudit -> Prisma) and hang the test.
vi.mock('../services/audit.service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

describe('Join Waitlist Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn().mockReturnValue({});
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockReq = {
      body: {},
      get: vi.fn(),
    };

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should return 400 for missing name or email', async () => {
    mockReq.body = { name: 'John Doe' }; // Missing email

    await joinWaitlist(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid input data') })
    );
  });

  it('should return 400 for invalid email format', async () => {
    mockReq.body = { name: 'John Doe', email: 'invalid-email' };

    await joinWaitlist(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid input data') })
    );
  });

  it('should successfully process valid waitlist request', async () => {
    mockReq.body = {
      name: 'John Doe',
      email: 'john@example.com',
      organization: 'Test Hospital',
      role: 'Doctor'
    };

    // Mock service response
    vi.mocked(waitlistService.addToWaitlist).mockResolvedValue({
      success: true,
      method: 'SHEET'
    });

    await joinWaitlist(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Successfully joined the waitlist!' })
    );
  });

  it('should handle waitlist service errors gracefully', async () => {
    mockReq.body = {
      name: 'John Doe',
      email: 'john@example.com'
    };

    // Mock service to throw error
    vi.mocked(waitlistService.addToWaitlist).mockRejectedValue(
      new Error('Service unavailable')
    );

    await joinWaitlist(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error processing waitlist request' })
    );
  });

  it('should prevent duplicate emails', async () => {
    mockReq.body = {
      name: 'John Doe',
      email: 'john@example.com'
    };

    // Mock service to return duplicate prevention
    vi.mocked(waitlistService.addToWaitlist).mockResolvedValue({
      success: false,
      message: 'Email already exists in waitlist',
      method: 'DUPLICATE_PREVENTED'
    });

    await joinWaitlist(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(200); // Still returns 200 but with failure message
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ 
        message: 'Successfully joined the waitlist!',
        debug: expect.objectContaining({ 
          message: 'Email already exists in waitlist',
          method: 'DUPLICATE_PREVENTED' 
        })
      })
    );
  });
});