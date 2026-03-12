/**
 * Wellness Reminder Script
 * Run this script periodically (e.g., via cron) to send wellness reminders to patients
 * 
 * Usage: npx ts-node scripts/send-wellness-reminders.ts
 * 
 * Cron example (daily at 8am):
 * 0 8 * * * cd /path/to/backend && npx ts-node scripts/send-wellness-reminders.ts
 */

import { prisma } from '../src/lib/prisma';
import { emailService } from '../src/services/email.service';

interface Reminder {
    id: string;
    patient: {
        user: {
            email: string;
            firstName: string;
        };
    };
    type: string;
    title: string;
    time: string;
    frequency: string;
    daysOfWeek?: string | null;
}

async function sendWellnessReminders() {
    console.log('🏥 Starting wellness reminder check...');
    
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    console.log(`Current time: ${currentTime}, Day: ${currentDay}`);
    
    // Get all enabled reminders that match current time
    const reminders = await prisma.wellnessReminder.findMany({
        where: {
            enabled: true,
            time: currentTime,
            OR: [
                { frequency: 'DAILY' },
                { 
                    frequency: 'WEEKLY',
                    daysOfWeek: {
                        contains: currentDay
                    }
                }
            ]
        },
        include: {
            patient: {
                include: {
                    user: true
                }
            }
        }
    });
    
    console.log(`Found ${reminders.length} reminders to send`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const reminder of reminders) {
        try {
            const patientEmail = reminder.patient.user.email;
            const patientName = reminder.patient.user.firstName;
            
            if (!patientEmail) {
                console.log(`⚠️ No email for patient ${reminder.patientId}`);
                continue;
            }
            
            // Build email content based on reminder type
            const emailContent = getReminderEmailContent(reminder);
            
            await emailService.sendEmail({
                to: patientEmail,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text
            });
            
            console.log(`✅ Sent ${reminder.type} reminder to ${patientEmail}`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to send reminder ${reminder.id}:`, error);
            failCount++;
        }
    }
    
    // Check for missed medication doses
    await checkMissedMedications();
    
    console.log(`\n📊 Summary:`);
    console.log(`   - Reminders sent: ${successCount}`);
    console.log(`   - Failed: ${failCount}`);
    console.log(`\n✨ Wellness reminder check complete!`);
    
    await prisma.$disconnect();
    process.exit(failCount > 0 ? 1 : 0);
}

function getReminderEmailContent(reminder: Reminder) {
    const patientName = reminder.patient.user.firstName || 'there';
    
    switch (reminder.type) {
        case 'MEDICATION':
            return {
                subject: '💊 Time to take your medication',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4F46E5;">Medication Reminder</h2>
                        <p>Hi ${patientName},</p>
                        <p>This is a friendly reminder to take your medication.</p>
                        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                            <strong>${reminder.title}</strong>
                        </div>
                        <p>Log your dose in the OltraHMS wellness tracker to track your adherence.</p>
                        <p style="color: #6B7280; font-size: 14px;">
                            Best regards,<br>
                            OltraHMS Wellness Team
                        </p>
                    </div>
                `,
                text: `Hi ${patientName}, this is a reminder to take your medication: ${reminder.title}. Log it in OltraHMS.`
            };
            
        case 'VITALS':
            return {
                subject: '📊 Time to log your vitals',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #DC2626;">Vitals Check Reminder</h2>
                        <p>Hi ${patientName},</p>
                        <p>Don't forget to log your vital signs today!</p>
                        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                            <strong>${reminder.title}</strong>
                        </div>
                        <p>Tracking your vitals helps you and your healthcare provider understand your health better.</p>
                        <a href="#" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">
                            Log Vitals Now
                        </a>
                    </div>
                `,
                text: `Hi ${patientName}, time to log your vitals: ${reminder.title}. Track in OltraHMS.`
            };
            
        case 'MOOD':
            return {
                subject: '🧠 How are you feeling today?',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #F59E0B;">Daily Mood Check</h2>
                        <p>Hi ${patientName},</p>
                        <p>How are you feeling today? Take a moment to log your mood.</p>
                        <p>Tracking your mood helps identify patterns and triggers.</p>
                        <a href="#" style="display: inline-block; background: #F59E0B; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">
                            Log Your Mood
                        </a>
                    </div>
                `,
                text: `Hi ${patientName}, how are you feeling today? Take a moment to log your mood in OltraHMS.`
            };
            
        case 'SLEEP':
            return {
                subject: '🌙 How was your sleep?',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #7C3AED;">Sleep Tracker</h2>
                        <p>Hi ${patientName},</p>
                        <p>Did you track your sleep last night? Good sleep is essential for your health.</p>
                        <a href="#" style="display: inline-block; background: #7C3AED; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">
                            Log Sleep
                        </a>
                    </div>
                `,
                text: `Hi ${patientName}, log your sleep in OltraHMS to track your rest patterns.`
            };
            
        default:
            return {
                subject: `⏰ ${reminder.title}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Wellness Reminder</h2>
                        <p>Hi ${patientName},</p>
                        <p>${reminder.title}</p>
                    </div>
                `,
                text: `Hi ${patientName}, ${reminder.title}`
            };
    }
}

async function checkMissedMedications() {
    console.log('\n💊 Checking for missed medications...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
    const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));
    
    // Find active medications
    const medications = await prisma.wellnessMedication.findMany({
        where: {
            status: 'ACTIVE'
        },
        include: {
            patient: {
                include: {
                    user: true
                }
            },
            logs: {
                where: {
                    scheduledTime: {
                        gte: yesterdayStart,
                        lte: yesterdayEnd
                    }
                }
            }
        }
    });
    
    let missedCount = 0;
    
    for (const med of medications) {
        const times = JSON.parse(med.times) as string[];
        
        for (const time of times) {
            const scheduledDateTime = new Date(yesterday);
            const [hours, minutes] = time.split(':');
            scheduledDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            // Check if there's a log for this time
            const hasLog = med.logs.some(log => {
                const logTime = new Date(log.scheduledTime);
                return Math.abs(logTime.getTime() - scheduledDateTime.getTime()) < 3600000; // within 1 hour
            });
            
            if (!hasLog) {
                // Send reminder about missed medication
                const patientEmail = med.patient.user.email;
                if (patientEmail) {
                    try {
                        await emailService.sendEmail({
                            to: patientEmail,
                            subject: '⚠️ Missed Medication Reminder',
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #DC2626;">Missed Medication</h2>
                                    <p>Hi ${med.patient.user.firstName},</p>
                                    <p>We noticed you may have missed your medication yesterday:</p>
                                    <div style="background: #FEE2E2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                                        <strong>${med.name}</strong> (${med.dosage})<br>
                                        Scheduled time: ${time}
                                    </div>
                                    <p>If you forgot to take it, please log it when you can. Consistent medication adherence is important for your treatment.</p>
                                    <p style="color: #6B7280; font-size: 14px;">
                                        OltraHMS Wellness Team
                                    </p>
                                </div>
                            `,
                            text: `You may have missed ${med.name} (${med.dosage}) yesterday at ${time}. Log it in OltraHMS when you can.`
                        });
                        missedCount++;
                    } catch (error) {
                        console.error(`Failed to send missed medication email:`, error);
                    }
                }
            }
        }
    }
    
    console.log(`   - Missed medication reminders sent: ${missedCount}`);
}

// Run the script
sendWellnessReminders().catch(console.error);
