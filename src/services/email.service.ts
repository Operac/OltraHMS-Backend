import nodemailer from 'nodemailer';
import { escape } from 'lodash';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw logic error for email failure, just log it
  }
};

export const sendWelcomeEmail = async (email: string, name: string) => {
  const subject = 'Welcome to OltraHMS';
  const safeName = escape(name);
  const html = `
    <h1>Welcome ${safeName}!</h1>
    <p>Your account has been successfully created.</p>
    <p>Please login to complete your profile.</p>
  `;
  await sendEmail(email, subject, html);
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${escape(token)}`;
  const subject = 'Password Reset Request';
  const html = `
    <h1>Reset Your Password</h1>
    <p>Click the link below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetLink}">Reset Password</a>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send appointment confirmation email
 */
export const sendAppointmentConfirmationEmail = async (
  email: string,
  patientName: string,
  doctorName: string,
  appointmentDate: string,
  appointmentTime: string,
  type: string
) => {
  const subject = 'Appointment Confirmation - OltraHMS';
  // Sanitize all user inputs to prevent XSS
  const safePatientName = escape(patientName);
  const safeDoctorName = escape(doctorName);
  const safeDate = escape(appointmentDate);
  const safeTime = escape(appointmentTime);
  const safeType = escape(type);
  
  const html = `
    <h1>Appointment Confirmed</h1>
    <p>Dear ${safePatientName},</p>
    <p>Your appointment has been confirmed. Here are the details:</p>
    <ul>
      <li><strong>Doctor:</strong> ${safeDoctorName}</li>
      <li><strong>Date:</strong> ${safeDate}</li>
      <li><strong>Time:</strong> ${safeTime}</li>
      <li><strong>Type:</strong> ${safeType}</li>
    </ul>
    <p>Please arrive 15 minutes early.</p>
    <p>Best regards,<br>OltraHMS Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send appointment reminder email
 */
export const sendAppointmentReminderEmail = async (
  email: string,
  patientName: string,
  doctorName: string,
  appointmentDate: string,
  appointmentTime: string
) => {
  const subject = 'Appointment Reminder - OltraHMS';
  const html = `
    <h1>Appointment Reminder</h1>
    <p>Dear ${patientName},</p>
    <p>This is a reminder about your upcoming appointment:</p>
    <ul>
      <li><strong>Doctor:</strong> ${doctorName}</li>
      <li><strong>Date:</strong> ${appointmentDate}</li>
      <li><strong>Time:</strong> ${appointmentTime}</li>
    </ul>
    <p>Please arrive 15 minutes early.</p>
    <p>Best regards,<br>OltraHMS Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send appointment cancellation email
 */
export const sendAppointmentCancellationEmail = async (
  email: string,
  patientName: string,
  doctorName: string,
  appointmentDate: string
) => {
  const subject = 'Appointment Cancelled - OltraHMS';
  const html = `
    <h1>Appointment Cancelled</h1>
    <p>Dear ${patientName},</p>
    <p>Your appointment has been cancelled:</p>
    <ul>
      <li><strong>Doctor:</strong> ${doctorName}</li>
      <li><strong>Date:</strong> ${appointmentDate}</li>
    </ul>
    <p>Please book a new appointment if needed.</p>
    <p>Best regards,<br>OltraHMS Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send prescription ready email
 */
export const sendPrescriptionReadyEmail = async (
  email: string,
  patientName: string,
  medicationNames: string[]
) => {
  const subject = 'Prescription Ready - OltraHMS';
  const html = `
    <h1>Prescription Ready for Pickup</h1>
    <p>Dear ${patientName},</p>
    <p>Your prescription is ready for pickup. The following medications have been prescribed:</p>
    <ul>
      ${medicationNames.map(med => `<li>${med}</li>`).join('')}
    </ul>
    <p>Please visit the pharmacy to collect your medications.</p>
    <p>Best regards,<br>OltraHMS Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send lab results ready email
 */
export const sendLabResultsEmail = async (
  email: string,
  patientName: string,
  testName: string
) => {
  const subject = 'Lab Results Available - OltraHMS';
  const html = `
    <h1>Lab Results Available</h1>
    <p>Dear ${patientName},</p>
    <p>Your lab results for <strong>${testName}</strong> are now available.</p>
    <p>Please login to your patient portal to view the results.</p>
    <p>Best regards,<br>OltraHMS Team</p>
  `;
  await sendEmail(email, subject, html);
};

/**
 * Send low stock alert to pharmacists
 */
export const sendLowStockAlertEmail = async (
  email: string,
  medications: { name: string; currentStock: number; reorderLevel: number }[]
) => {
  const subject = '⚠️ Low Stock Alert - OltraHMS';
  const html = `
    <h1>Low Stock Alert</h1>
    <p>The following medications are below the reorder level:</p>
    <table style="border-collapse: collapse; width: 100%;">
      <tr style="background-color: #f2f2f2;">
        <th style="padding: 8px; border: 1px solid #ddd;">Medication</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Current Stock</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Reorder Level</th>
      </tr>
      ${medications.map(med => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${med.name}</td>
          <td style="padding: 8px; border: 1px solid #ddd; color: red;">${med.currentStock}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${med.reorderLevel}</td>
        </tr>
      `).join('')}
    </table>
    <p>Please reorder these items as soon as possible.</p>
    <p>Best regards,<br>OltraHMS System</p>
  `;
  await sendEmail(email, subject, html);
};
