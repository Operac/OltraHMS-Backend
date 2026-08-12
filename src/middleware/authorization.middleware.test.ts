import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import { Role } from '@prisma/client';
import { authorize, type AuthRequest } from './auth.middleware';

const callAuthorize = (role?: Role) => {
  const status = vi.fn();
  const json = vi.fn();
  status.mockReturnValue({ json });
  const next = vi.fn() as unknown as NextFunction;
  const request = {
    user: role ? { id: 'user-1', email: 'user@example.com', role } : undefined
  } as AuthRequest;

  authorize([Role.ADMIN, Role.RECEPTIONIST])(request, { status } as unknown as Response, next);
  return { status, next };
};

describe('authorize', () => {
  it('allows an authorized role', () => {
    const result = callAuthorize(Role.RECEPTIONIST);
    expect(result.next).toHaveBeenCalledOnce();
  });

  it('rejects an authenticated but unauthorized role', () => {
    const result = callAuthorize(Role.PATIENT);
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it('rejects missing authentication', () => {
    const result = callAuthorize();
    expect(result.status).toHaveBeenCalledWith(401);
  });
});

