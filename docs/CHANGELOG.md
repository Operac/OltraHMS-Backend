# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

#### Enhanced 2FA Encryption
- **Dedicated Encryption Key**: 2FA secrets now use a separate `ENCRYPTION_SECRET` environment variable instead of deriving from `JWT_SECRET`
- Key format: 64-character hex string (32 bytes) for AES-256-CBC encryption
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### Security Headers
- Enhanced Helmet configuration with explicit security headers:
  - **Content-Security-Policy**: Restricts resource loading to same-origin with safe defaults
  - **HSTS** (HTTP Strict Transport Security): 1-year max age with subdomain support and preload
  - **X-XSS-Protection**: Enabled browser XSS filter
  - **X-Content-Type-Options**: Prevents MIME type sniffing
  - **Referrer-Policy**: Strict origin when cross-origin
  - **Permissions-Policy**: Controls browser features
  - **Permitted-Policies**: Disables Adobe Flash/pdfs

#### Additional Security Features
- **HTTPS Redirect**: Production server redirects HTTP to HTTPS
- **Session Timeout**: 30-minute session timeout with automatic cleanup
- **Password Reset IP Tracking**: Stores IP address when password reset is requested for security monitoring

### Database Changes
- Added `lastResetIp` field to User model for password reset security
- Run `npx prisma generate` and `npx prisma db push` to apply changes

## [1.1.0] - 2026-03-12

### Added

#### Currency Support
- Nigerian Naira (₦) support across all financial models
- Currency field added to: Service, Invoice, Medication, InventoryBatch, Bed, Ward, Payroll, Staff

#### Security
- **2FA Encryption**: TOTP secrets now encrypted with AES-256-CBC before storage
- **Secure Password Generation**: Patient registration now uses cryptographically secure random passwords
- **Payment Verification**: Added payment verification before pharmacy dispensing and lab result uploads
- **Inventory Availability Check**: New endpoint to check prescription availability

#### Business Logic
- **FEFO Batch Selection**: Pharmacy dispensing now uses First-Expired-First-Out batch selection
- **Prescription Medication Validation**: Doctors now see warnings when prescribing medications not in inventory
- **Unique Invoice Numbers**: Invoice generation uses timestamp + random hex to prevent collisions

### Changed

#### Financial Flows
- Pharmacy dispensing requires verified payment (invoice status: PAID)
- Lab result uploads require verified payment
- Doctor consultation fees now require service configuration (no hardcoded $50)
- Admission fees now require ward/bed price configuration

#### Default Values
- Password: Now generated using `crypto.randomBytes(8).toString('hex')` wrapped with "Oltra" prefix
- Currency: Changed from USD to NGN (Nigerian Naira)

### Fixed

#### Critical Business Logic
- **Pharmacy Dispensing**: Fixed issue where medications could be dispensed without payment verification
- **Lab Results Upload**: Fixed issue where lab results could be uploaded without payment verification
- **Invoice Creation**: Fixed duplicate invoice creation on every pharmacy dispense
- **Invoice Number Collision**: Fixed risk of invoice number collision using timestamp + random hex

#### Security Issues
- **Default Password**: Fixed hardcoded default password vulnerability
- **2FA Secret Storage**: Fixed plain text storage of 2FA secrets
- **Consultation Fee**: Removed hardcoded $50 consultation fee (now requires service configuration)
- **Admission Pricing**: Removed hardcoded admission prices (now requires ward/bed configuration)

### Removed
- Hardcoded consultation fees
- Hardcoded admission fees
- Hardcoded default passwords
- Unencrypted 2FA secrets storage

## [1.0.0] - 2026-01-23

### Added

#### Security
- Rate limiting on authentication endpoints (`authLimiter`, `loginLimiter`)
- Input sanitization utilities for XSS prevention
- Global error handler with production-safe error messages
- CORS configuration that blocks localhost in production
- Environment variable support for default passwords
- Password reset completion endpoint (`POST /api/auth/reset-password`)

#### Features
- **Appointment Reminders**: Automated reminder script for upcoming appointments
- **Prescription Refill Tracking**: 
  - New `RefillRequest` model for tracking refill requests
  - Fields: `refillsRemaining`, `lastRefillDate`, `nextRefillDate`
- **UI Loading States**: Reusable loading components (`Loading`, `Skeleton`, `TableSkeleton`, `CardSkeleton`, `FormSkeleton`)

#### Database
- **Indexes**: Added indexes on frequently queried fields
  - `Appointment`: patientId, doctorId, appointmentDate, status
  - `MedicalRecord`: patientId, doctorId, visitDate
  - `Patient`: firstName+lastName, patientNumber, phone
  - `AuditLog`: userId, timestamp, entityType+entityId
- **Soft Delete**: Added `isDeleted` and `deletedAt` fields to User, Patient, Staff models
- **Audit Log Partitioning**: Documentation added for future partitioning strategy

#### Email Notifications
- Appointment confirmation emails
- Appointment reminder emails  
- Appointment cancellation emails
- Prescription ready notifications
- Lab results notifications
- Low stock alerts
- PDF prescription generation

### Changed

#### Security Improvements
- Default password now uses environment variable (`ADMIN_PASSWORD`, `SEED_PASSWORD`)
- CORS now respects `NODE_ENV=production` setting

### Deprecated

### Removed

### Fixed

### Security

## Previous Versions

- Initial release: HMS.md specification baseline
