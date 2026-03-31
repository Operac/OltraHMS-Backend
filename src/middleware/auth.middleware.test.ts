import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Response, NextFunction } from 'express';

// Mock jwt module before importing auth.middleware
vi.mock('jsonwebtoken', () => ({
  verify: vi.fn((token: string, secret: string) => {
    // Return a promise that resolves with the decoded token (like real jwt.verify)
    if (token === 'invalid-token') {
      return Promise.reject(new Error('Invalid token'));
    }
    return Promise.resolve({ id: 'user-123', email: 'test@example.com', role: 'ADMIN' });
  }),
}));

import { authenticate, authorize } from './auth.middleware';
import { AuthRequest } from './auth.middleware';

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
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
      header: vi.fn().mockReturnValue(undefined), // Default to no token
      user: undefined,
    };
  });
  
  afterEach(() => {
    // Clean up
    delete process.env.JWT_SECRET;
  });

  describe('authenticate', () => {
    it('should call next() with valid token', async () => {
      // Arrange
      const mockToken = 'valid-token';
      mockRequest.header = vi.fn().mockReturnValue(`Bearer ${mockToken}`);

      // Act
      await authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert - next should be called with the user set
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
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

    it('should return 401 with invalid token', async () => {
      // Arrange
      mockRequest.header = vi.fn().mockReturnValue('Bearer invalid-token');

      // Act
      await authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', async () => {
      // Arrange - Token without Bearer prefix but still valid
      mockRequest.header = vi.fn().mockReturnValue('some-token');

      // Act
      await authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert - token without Bearer still works
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('should call next() if user has required role', () => {
      // Arrange
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN' as any,
      };

      const authorizeMiddleware = authorize(['ADMIN']);

      // Act
      authorizeMiddleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 if user not authenticated', () => {
      // Arrange
      mockRequest.user = undefined;

      const authorizeMiddleware = authorize(['ADMIN']);

      // Act
      authorizeMiddleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if user lacks required role', () => {
      // Arrange
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'PATIENT' as any,
      };

      const authorizeMiddleware = authorize(['ADMIN', 'DOCTOR']);

      // Act
      authorizeMiddleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Forbidden' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow access for one of multiple roles', () => {
      // Arrange
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'DOCTOR' as any,
      };

      const authorizeMiddleware = authorize(['ADMIN', 'DOCTOR']);

      // Act
      authorizeMiddleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
    });
  });
});