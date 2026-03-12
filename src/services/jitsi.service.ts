import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Jitsi JWT Token Generator
 * 
 * For self-hosted Jitsi Meet servers, you need to generate JWT tokens.
 * If using the free Jitsi Meet cloud service (meet.jit.si), you don't need tokens.
 * 
 * Environment variables required:
 * - JITSI_SECRET: The API secret from your Jitsi Meet installation
 * - JITSI_APP_ID: Your app ID (usually "oltrahms")
 * - JITSI_URL: Your Jitsi Meet server URL (e.g., "https://meet.yourdomain.com")
 */

interface JitsiTokenPayload {
    aud: string;
    iss: string;
    sub: string;
    room: string;
    exp: number;
    iat: number;
    nick?: string;
    email?: string;
}

export const generateJitsiToken = (
    roomName: string, 
    userName: string, 
    isHost: boolean = false
): { token: string; url: string } | null => {
    const appId = process.env.JITSI_APP_ID || 'oltrahms';
    const secret = process.env.JITSI_SECRET;
    const jitsiUrl = process.env.JITSI_URL || 'https://meet.jit.si';
    
    // If no secret is configured, return null to indicate Jitsi is not configured
    // The frontend should use the embedded Jitsi Meet URL without authentication
    if (!secret) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // Token expires in 1 hour

    const payload: JitsiTokenPayload = {
        aud: 'jitsi',
        iss: appId,
        sub: jitsiUrl,
        room: roomName,
        exp,
        iat: now,
        nick: userName,
    };

    const token = jwt.sign(payload, secret, {
        algorithm: 'HS256'
    });

    return {
        token,
        url: `${jitsiUrl}/${roomName}`
    };
};

/**
 * Generate a unique room name for a video session
 */
export const generateRoomName = (appointmentId: string): string => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `oltrahms-${appointmentId.slice(0, 8)}-${timestamp}-${random}`;
};

/**
 * Get Jitsi configuration for frontend
 */
export const getJitsiConfig = (): { 
    enabled: boolean; 
    url: string; 
    useToken: boolean 
} => {
    const jitsiUrl = process.env.JITSI_URL || 'https://meet.jit.si';
    const hasSecret = !!process.env.JITSI_SECRET;
    
    return {
        enabled: true,
        url: jitsiUrl,
        useToken: hasSecret
    };
};
