import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Key helpers.
 *
 * Hospitals typically put all staff behind a single public IP (NAT), so pure
 * per-IP limits throttle the whole building at once. Where we can identify the
 * actor we key per-user / per-account instead. Keys are prefixed so they are
 * never a bare IP string (which express-rate-limit's IPv6 validation rejects).
 */
const perUserOrIp = (req: Request): string => {
  const userId = (req as any).user?.id;
  return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
};

const perIp = (req: Request): string => `ip:${req.ip || 'unknown'}`;

const perEmail = (req: Request): string => {
  const email = (req.body?.email || '').toString().toLowerCase().trim();
  return email ? `login:${email}` : `ip:${req.ip || 'unknown'}`;
};

/**
 * Rate limiter for general (pre-auth) authentication endpoints:
 * register, forgot/reset password, 2FA verify. Keyed per IP — raised from 10 to
 * 30 so a shared hospital IP isn't blocked by a handful of legitimate users.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  keyGenerator: perIp,
  message: {
    success: false,
    message: 'Too many attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * Brute-force protection for login. Keyed per ACCOUNT (email) rather than per IP
 * so one staff member's typos don't lock out everyone sharing the clinic's IP.
 * Only failed attempts are counted. (The auth controller also locks the account
 * after repeated failures.)
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: perEmail,
  message: {
    success: false,
    message: 'Account temporarily locked due to too many failed attempts'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

/**
 * Token refresh limiter. Legitimate clients refresh roughly every 15 minutes, so
 * a generous per-IP allowance is needed for many staff behind one NAT IP.
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  keyGenerator: perIp,
  message: {
    success: false,
    message: 'Too many token refreshes, please try again shortly'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * General API rate limiter for protected routes. Keyed per authenticated USER
 * (falls back to IP for public/unauthenticated routes) so a busy dashboard for
 * one user can't exhaust the whole site's shared-IP budget.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: perUserOrIp,
  message: {
    success: false,
    message: 'Too many requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for sensitive operations.
 */
export const sensitiveOpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: perUserOrIp,
  message: {
    success: false,
    message: 'Rate limit exceeded for this operation'
  },
  standardHeaders: true,
  legacyHeaders: false
});
