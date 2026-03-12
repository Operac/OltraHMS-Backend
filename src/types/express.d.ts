import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Role } from '@prisma/client';

/**
 * Extended request with authenticated user
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

/**
 * Generic controller function type
 */
export type ControllerFunc = (
  req: AuthRequest,
  res: Response,
  next?: NextFunction
) => Promise<void | Response>;

/**
 * Async controller wrapper to reduce try-catch boilerplate
 */
export const asyncHandler = (fn: ControllerFunc): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);
  };
};

/**
 * TypedRequest with body validation
 */
export interface TypedRequest<T> extends AuthRequest {
  body: T;
}

/**
 * TypedRequest with query validation
 */
export interface TypedRequestQuery<T, Q> extends AuthRequest {
  body: T;
  query: Q;
}
