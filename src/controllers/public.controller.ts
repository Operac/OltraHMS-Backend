import { Request, Response } from 'express';
import { waitlistService } from '../services/waitlist.service';

export const joinWaitlist = async (req: Request, res: Response) => {
    try {
        const { name, email, organization, role } = req.body;

        if (!name || !email) {
            return res.status(400).json({ message: 'Name and Email are required' });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const result = await waitlistService.addToWaitlist({ name, email, organization, role });

        res.status(200).json({ 
            message: 'Successfully joined the waitlist!',
            debug: result // Optional: remove in prod
        });

    } catch (error) {
        console.error('Waitlist Error:', error);
        res.status(500).json({ message: 'Internal server error processing waitlist request' });
    }
};
