import { Request, Response } from 'express';
import { waitlistService } from '../services/waitlist.service';
import { z } from 'zod';
import { logAudit } from '../services/audit.service';

const waitlistSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
    email: z.string().email('Invalid email address').max(255, 'Email too long'),
    organization: z.string().max(200, 'Organization name too long').optional().default('N/A'),
    role: z.enum(['Administrator', 'Doctor', 'Receptionist', 'Owner', 'Patient', 'Nurse', 'Pharmacist', 'Lab Tech', 'Accountant']).optional().default('Patient')
});

export const joinWaitlist = async (req: Request, res: Response) => {
    try {
        // Validate request body
        const validationResult = waitlistSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({ 
                message: 'Invalid input data', 
                errors: validationResult.error.issues 
            });
        }

        const { name, email, organization, role } = validationResult.data;

        // Additional bot protection: check for suspiciously fast submissions
        const userAgent = req.get('User-Agent') || '';
        if (!userAgent || userAgent.length < 10) {
            // Log but don't block - could be legitimate mobile/app request
            console.warn('Suspicious user agent in waitlist submission:', userAgent);
        }

        // Check for duplicate email (basic check - in production would want DB constraint)
        // Note: For true duplicate prevention, we'd need to store in database
        // For now, we rely on Google Sheets uniqueness or application logic

        const result = await waitlistService.addToWaitlist({ name, email, organization, role });

        // Log successful waitlist entry (anonymized for privacy)
        try {
            await logAudit(
                '00000000-0000-0000-0000-000000000000', // Anonymous user ID
                'WAITLIST_JOIN',
                `Waitlist entry for email domain: ${email.split('@')[1] || 'unknown'}`,
                req.ip || 'unknown'
            );
        } catch (auditError) {
            console.warn('Failed to log waitlist audit:', auditError);
        }

        res.status(200).json({ 
            message: 'Successfully joined the waitlist!',
            // Remove debug info in production
            ...(process.env.NODE_ENV !== 'production' && { debug: result })
        });

    } catch (error) {
        console.error('Waitlist Error:', error);
        res.status(500).json({ message: 'Internal server error processing waitlist request' });
    }
};
