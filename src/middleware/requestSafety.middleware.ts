import type { NextFunction, Request, Response } from 'express';

const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);

const containsUnsafeKey = (root: unknown): boolean => {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > 20) return true;
    if (!current.value || typeof current.value !== 'object') continue;

    for (const [key, value] of Object.entries(current.value)) {
      if (blockedKeys.has(key)) return true;
      pending.push({ value, depth: current.depth + 1 });
    }
  }

  return false;
};

/** Reject prototype-pollution keys and excessively deep JSON before routing. */
export const rejectUnsafeInput = (req: Request, res: Response, next: NextFunction) => {
  if (containsUnsafeKey(req.body) || containsUnsafeKey(req.query) || containsUnsafeKey(req.params)) {
    return res.status(400).json({ message: 'Invalid request payload' });
  }

  next();
};

