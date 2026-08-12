import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rejectUnsafeInput } from './requestSafety.middleware';

const run = (input: Partial<Request>) => {
  const status = vi.fn();
  const json = vi.fn();
  status.mockReturnValue({ json });
  const next = vi.fn() as unknown as NextFunction;
  const request = { body: {}, query: {}, params: {}, ...input } as Request;
  rejectUnsafeInput(request, { status } as unknown as Response, next);
  return { status, json, next };
};

describe('rejectUnsafeInput', () => {
  it('allows normal nested payloads', () => {
    const result = run({ body: { patient: { name: 'Ada' }, values: [1, 2] } });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it('rejects prototype-pollution keys', () => {
    const body = JSON.parse('{"profile":{"__proto__":{"admin":true}}}');
    const result = run({ body });
    expect(result.status).toHaveBeenCalledWith(400);
    expect(result.next).not.toHaveBeenCalled();
  });

  it('rejects excessively deep payloads', () => {
    let body: Record<string, unknown> = {};
    let cursor = body;
    for (let depth = 0; depth < 22; depth += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const result = run({ body });
    expect(result.status).toHaveBeenCalledWith(400);
  });
});

