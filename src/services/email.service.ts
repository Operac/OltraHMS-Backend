import nodemailer from 'nodemailer';

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
  const html = `
    <h1>Welcome ${name}!</h1>
    <p>Your account has been successfully created.</p>
    <p>Please login to complete your profile.</p>
  `;
  await sendEmail(email, subject, html);
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const subject = 'Password Reset Request';
  const html = `
    <h1>Reset Your Password</h1>
    <p>Click the link below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetLink}">Reset Password</a>
  `;
  await sendEmail(email, subject, html);
};
