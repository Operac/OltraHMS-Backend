import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, NextFunction } from 'express';

// Mock jwt module before importing auth.middleware
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn((token: string, secret: string, callback: Function) => {
      // Default implementation - tests can override
      if (token === 'invalid-token') {
        callback(new Error('Invalid token'), null);
      } else {
        callback(null, { id: 'user-123', email: 'test@example.com', role: 'ADMIN' });
      }
    }),
  },
  verify: vi.fn(),
}));

import { authenticate, authorize } from './auth.middleware';
import { AuthRequest } from './auth.middleware';

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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

  describe('authenticate', () => {
    it('should call next() with valid token', () => {
      // Arrange
      const mockToken = 'valid-token';
      (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${mockToken}`);

      // Act
      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert - next should be called with the user set
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
    });

    it('should return 401 without token', () => {
      // Arrange
      (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      // Act
      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 with invalid token', () => {
      // Arrange
      (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue('Bearer invalid-token');

      // Act
      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', () => {
      // Arrange - Token without Bearer prefix but still valid
      (mockRequest.header as ReturnType<typeof vi.fn>).mockReturnValue('some-token');

      // Act
      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

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
