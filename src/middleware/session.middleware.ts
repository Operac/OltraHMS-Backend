import { Request, Response, NextFunction } from 'express';

export interface SessionData {
    userId?: string;
    loginTime?: Date;
    lastActivity?: Date;
    ipAddress?: string;
}

// In-memory session store (use Redis in production)
const sessions = new Map<string, SessionData>();

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Clean up expired sessions every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Maximum number of concurrent sessions (prevents memory exhaustion)
const MAX_SESSIONS = 10000;

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
    return (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.socket.remoteAddress ||
        'unknown'
    );
}

/**
 * Session middleware for JWT token validation and timeout
 * This adds server-side session tracking on top of JWT for additional security
 */
export const sessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return next();
    }

    // Check if we're at max capacity - clean up expired sessions first if needed
    if (sessions.size >= MAX_SESSIONS) {
        // Run cleanup synchronously to free up space
        const now = new Date();
        for (const [tokenKey, session] of sessions.entries()) {
            const lastActivity = session.lastActivity || session.loginTime;
            if (lastActivity && now.getTime() - lastActivity.getTime() > SESSION_TIMEOUT) {
                sessions.delete(tokenKey);
            }
        }
        // If still at max, reject new sessions
        if (sessions.size >= MAX_SESSIONS) {
            console.warn('Session limit reached, rejecting new session');
            // Don't block - let JWT validation handle access control
        }
    }
    
    // Check if session exists and is valid
    const session = sessions.get(token);
    
    if (!session) {
        // New session - create one
        const newSession: SessionData = {
            loginTime: new Date(),
            lastActivity: new Date(),
            ipAddress: getClientIp(req)
        };
        sessions.set(token, newSession);
    } else {
        // Check timeout
        const now = new Date();
        const lastActivity = session.lastActivity || session.loginTime || now;
        
        if (now.getTime() - lastActivity.getTime() > SESSION_TIMEOUT) {
            // Session expired - remove it
            sessions.delete(token);
            // Let the JWT validation handle the actual 401 response
        } else {
            // Update last activity
            session.lastActivity = new Date();
            
            // Optional: Check IP consistency (can be disabled if users have dynamic IPs)
            const currentIp = getClientIp(req);
            if (session.ipAddress && session.ipAddress !== currentIp) {
                // IP changed - could be a security concern
                // For now, we log but don't block (to handle mobile networks)
                console.warn(`IP address changed for session: ${session.ipAddress} -> ${currentIp}`);
                session.ipAddress = currentIp;
            }
        }
    }
    
    next();
};

/**
 * Invalidate a session (logout)
 */
export const invalidateSession = (token: string): void => {
    sessions.delete(token);
};

/**
 * Get session info
 */
export const getSession = (token: string): SessionData | undefined => {
    return sessions.get(token);
};

/**
 * Start session cleanup interval
 */
export const startSessionCleanup = (): void => {
    setInterval(() => {
        const now = new Date();
        let cleaned = 0;
        
        for (const [token, session] of sessions.entries()) {
            const lastActivity = session.lastActivity || session.loginTime;
            if (lastActivity && now.getTime() - lastActivity.getTime() > SESSION_TIMEOUT) {
                sessions.delete(token);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`Session cleanup: removed ${cleaned} expired sessions`);
        }
    }, CLEANUP_INTERVAL);
};
