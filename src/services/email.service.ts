import nodemailer from 'nodemailer';
import { escape } from 'lodash';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// FIX: verify transporter config on startup so you catch misconfig immediately
transporter.verify((error) => {
  if (error) {
    console.error('❌ Email transporter config error:', error);
  } else {
    console.log('✅ Email transporter ready');
  }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: `"OltraHMS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    // FIX: log the actual error so you can see it in Render logs
    console.error(`❌ Email failed to ${to}:`, error);
  }
};

// everything else below stays exactly the same
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

export const sendCredentialsEmail = async (
  email: string,
  name: string,
  role: string,
  patientNumber?: string
) => {
  const subject = 'Your Login Credentials - OltraHMS';
  const safeName = escape(name);
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
  
  let roleDisplay = role;
  if (role === 'PATIENT') roleDisplay = 'Patient';
  else if (role === 'DOCTOR') roleDisplay = 'Doctor';
  else if (role === 'NURSE') roleDisplay = 'Nurse';
  else if (role === 'RECEPTIONIST') roleDisplay = 'Receptionist';
  else if (role === 'PHARMACIST') roleDisplay = 'Pharmacist';
  else if (role === 'LAB_TECH') roleDisplay = 'Lab Technician';
  else if (role === 'ACCOUNTANT') roleDisplay = 'Accountant';
  else if (role === 'ADMIN') roleDisplay = 'Administrator';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #0ea5e9;">Welcome to OltraHMS!</h1>
      <p>Dear ${safeName},</p>
      <p>Your ${roleDisplay} account has been created. Here are your login credentials:</p>
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>Email:</strong> ${escape(email)}</p>
        <p style="margin: 8px 0;"><strong>Password:</strong> Oltra123!</p>
        ${patientNumber ? `<p style="margin: 8px 0;"><strong>Patient Number:</strong> ${escape(patientNumber)}</p>` : ''}
      </div>
      <p>Please login at: <a href="${loginUrl}" style="color: #0ea5e9;">${loginUrl}</a></p>
      <p><strong>Important:</strong> Please change your password after your first login for security.</p>
      <p style="margin-top: 30px;">Best regards,<br>OltraHMS Team</p>
    </div>
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

export const sendAppointmentConfirmationEmail = async (
  email: string,
  patientName: string,
  doctorName: string,
  appointmentDate: string,
  appointmentTime: string,
  type: string
) => {
  const subject = 'Appointment Confirmation - OltraHMS';
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