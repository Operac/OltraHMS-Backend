import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    public errors?: Record<string, string[]>
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new ApiError(400, message, true, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  static validationError(message: string, errors: Record<string, string[]>) {
    return new ApiError(422, message, true, errors);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, false);
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    // Zod v4 uses 'issues' instead of 'errors'
    const zodIssues = 'errors' in err ? err.errors : err.issues;
    (zodIssues as any[]).forEach((error: any) => {
      const path = error.path.join('.');
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(error.message);
    });

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const message = handlePrismaError(err);
    return res.status(400).json({
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid data provided',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle custom API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      timestamp: new Date().toISOString(),
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      timestamp: new Date().toISOString(),
    });
  }

  // Default error response
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message = process.env.NODE_ENV === 'production' 
    ? (err instanceof ApiError ? err.message : 'Internal server error')
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle Prisma known errors
 */
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): string {
  switch (err.code) {
    case 'P2000':
      return 'The provided value for the column is too long';
    case 'P2001':
      return 'Record does not exist';
    case 'P2002':
      return 'A record with this value already exists';
    case 'P2003':
      return 'Foreign key constraint failed';
    case 'P2004':
      return 'A constraint failed';
    case 'P2005':
      return 'The value stored in the database is invalid for this field';
    case 'P2006':
      return 'The provided value is not valid for this field';
    case 'P2007':
      return 'Data validation error';
    case 'P2008':
      return 'Failed to parse the query';
    case 'P2009':
      return 'Failed to validate the query';
    case 'P2010':
      return 'Raw query failed';
    case 'P2011':
      return 'Null constraint violation';
    case 'P2012':
      return 'Missing a required value';
    case 'P2013':
      return 'Missing the required argument';
    case 'P2014':
      return 'The change would break the required constraints';
    case 'P2015':
      return 'A related record could not be found';
    case 'P2016':
      return 'Query interpretation error';
    case 'P2017':
      return 'The records for relation are not connected';
    case 'P2018':
      return 'The required connected records were not found';
    case 'P2019':
      return 'Input error';
    case 'P2020':
      return 'Value out of range';
    case 'P2021':
      return 'The table does not exist in the current database';
    case 'P2022':
      return 'The column does not exist in the database';
    case 'P2023':
      return 'Database row is missing';
    case 'P2025':
      return 'An operation failed because it depends on one or more other records';
    case 'P2026':
      return 'Generic pool timeout';
    case 'P2027':
      return 'Multiple errors';
    default:
      return 'Database operation failed';
  }
}

/**
 * Async handler to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}
