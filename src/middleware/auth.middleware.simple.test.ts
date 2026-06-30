import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Response } from 'express';

// auth.middleware uses a default import of jsonwebtoken, so the mock must expose
// `verify` on both the default and named export. Created via vi.hoisted so it
// exists before the hoisted vi.mock factory runs.
const { verifyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn((token: string, secret: string) => {
    if (token === 'valid-token' && secret === 'test-secret') {
      return Promise.resolve({ id: 'user-123', email: 'test@example.com', role: 'ADMIN' });
    }
    return Promise.reject(new Error('Invalid token'));
  }),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: verifyMock },
  verify: verifyMock,
}));

// Mock the auth.middleware directly
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}));

import { authenticate } from './auth.middleware';
import { AuthRequest } from './auth.middleware';

describe('Auth Middleware Simple Test', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: Function;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Set JWT secret for testing
    process.env.JWT_SECRET = 'test-secret';
    
    jsonMock = vi.fn();
    mockResponse = {
      status: vi.fn().mockReturnValue({ json: jsonMock }),
    } as any;
    mockNext = vi.fn();
    
    mockRequest = {
      header: vi.fn(),
      user: undefined,
    };
    
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    // Clean up
    delete process.env.JWT_SECRET;
  });

  it('should call next() with valid token', async () => {
    // Arrange
    const mockToken = 'valid-token';
    mockRequest.header = vi.fn().mockReturnValue(`Bearer ${mockToken}`);
    // jwt.verify is mocked at module scope (see top of file) to resolve for 'valid-token'.

    // Act
    await authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

    // Assert
    expect(mockNext).toHaveBeenCalled();
    expect(mockRequest.user).toBeDefined();
    expect(mockRequest.user?.email).toBe('test@example.com');
  });

  it('should return 401 without token', async () => {
    // Arrange
    mockRequest.header = vi.fn().mockReturnValue(undefined);

    // Act
    await authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Authentication required' });
    expect(mockNext).not.toHaveBeenCalled();
  });
});