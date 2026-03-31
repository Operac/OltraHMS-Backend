import { joinWaitlist } from './public.controller';
import { waitlistService } from '../services/waitlist.service';
import { Request, Response } from 'express';

// Mock the waitlist service
jest.mock('../services/waitlist.service');

describe('Join Waitlist Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn().mockReturnValue({});
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockReq = {
      body: {},
      get: jest.fn(),
    };

    // Clear all mocks before each test
    jest.clearAllMocks();
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
    (waitlistService.addToWaitlist as jest.Mock).mockResolvedValue({
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
    (waitlistService.addToWaitlist as jest.Mock).mockRejectedValue(
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
    (waitlistService.addToWaitlist as jest.Mock).mockResolvedValue({
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