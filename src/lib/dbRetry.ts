import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Runs `fn` inside a Serializable transaction, retrying a few times on
 * serialization/deadlock failures (Postgres 40001 / Prisma P2034).
 *
 * Use this for "check-then-write" flows that must not race under concurrent
 * users — e.g. assigning the next queue number, or booking an appointment slot
 * after checking for overlaps. Keep side effects (emails, sockets, calendar)
 * OUTSIDE the callback so they only run once the transaction commits.
 */
export async function runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: any) {
      lastError = error;
      const isSerializationFailure =
        error?.code === 'P2034' ||
        error?.code === '40001' ||
        /could not serialize|deadlock detected/i.test(error?.message || '');
      if (isSerializationFailure && attempt < retries) {
        continue; // transient conflict — retry
      }
      throw error;
    }
  }
  throw lastError;
}
