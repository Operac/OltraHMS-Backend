import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

export class WaitlistService {
    private doc: GoogleSpreadsheet | null = null;
    private initialized = false;

    private async init() {
        if (this.initialized) return;

        try {
            const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
            const sheetId = process.env.GOOGLE_SHEET_ID;

            if (!serviceAccountEmail || !privateKey || !sheetId) {
                console.warn('⚠️ Google Sheets credentials missing. Waitlist will only be logged.');
                return;
            }

            const jwt = new JWT({
                email: serviceAccountEmail,
                key: privateKey,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file',
                ],
            });

            this.doc = new GoogleSpreadsheet(sheetId, jwt);
            await this.doc.loadInfo();
            this.initialized = true;
            console.log(`✅ Connected to Google Sheet: ${this.doc.title}`);
        } catch (error) {
            console.error('❌ Failed to initialize Google Sheets service:', error);
            this.doc = null; // Ensure fallback
        }
    }

    async addToWaitlist(data: { name: string; email: string; organization?: string; role?: string }) {
        await this.init();

        const rowData = {
            Name: data.name,
            Email: data.email,
            Organization: data.organization || 'N/A',
            Role: data.role || 'N/A',
            Date: new Date().toISOString()
        };

        if (this.doc) {
            try {
                const sheet = this.doc.sheetsByIndex[0]; // Use first sheet
                await sheet.addRow(rowData);
                console.log(`📝 Added to Sheet: ${data.email}`);
                return { success: true, method: 'SHEET' };
            } catch (error) {
                console.error('❌ Failed to add row to Sheet:', error);
                // Fallback to log
            }
        }

        // Fallback or if credentials missing
        console.log('📝 [WAITLIST FALLBACK] New Entry:', rowData);
        return { success: true, method: 'LOG' };
    }
}

export const waitlistService = new WaitlistService();
