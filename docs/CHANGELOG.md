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

## [1.2.0] - 2026-06-30

### Added

#### Authentication — Silent Token Refresh
- New endpoint `POST /api/auth/refresh`: verifies the refresh token, re-fetches the user (so role changes and account lockouts take effect on refresh), issues a new 15-minute access token, and rotates the refresh token.
- Frontend stores the refresh token at login and transparently refreshes the access token on a `401`, retrying the original request. Concurrent `401`s share a single in-flight refresh.
- Files: `src/controllers/auth.controller.ts` (`refreshAccessToken`), `src/routes/auth.routes.ts`, `frontend/src/lib/api.ts` (`installAuthInterceptors`), `frontend/src/context/AuthContext.tsx`.

#### Offline-First Capture (front desk)
- Receptionist check-in/walk-in (`POST /api/queue/checkin`, `POST /api/queue/walkin`) and nurse triage + vitals (`POST /api/triage`) are now captured locally during connectivity/power outages and replayed automatically on reconnect.
- New helper `submitWithOfflineFallback()` in `frontend/src/services/offlineStorage.ts`; replay handled by `syncAllPendingData()`.

### Fixed

#### Critical
- **15-minute forced logout**: a refresh token was issued at login but never usable (no refresh endpoint, frontend never used it), so every session expired after 15 minutes. Now fully wired with silent refresh.
- **Broken offline sync**: `syncAllPendingData()` replayed requests with a relative URL and no `Authorization` header, so every replay failed (404/401). It now uses the configured API base URL and a fresh auth token.

#### Tests
- Repaired the backend Vitest suite (previously 14 failing across 7 files): Jest→Vitest conversion, correct `jsonwebtoken` default-export mocks, real-otplib 2FA tests, dynamic future dates for appointment tests, and proper `google-spreadsheet`/`google-auth-library` mocks. **94 tests passing.** No application logic was changed to make tests pass — the failures were stale/incorrect tests.

### Performance & Concurrency (scaling hardening)

- **Single Prisma connection pool**: removed 5 duplicate `new PrismaClient()` instances (in `doctor.routes`, `settings.routes`, `audit.service`, `availability.service`, `patient.service`) that each opened their own pool; all now use the shared `src/lib/prisma.ts` client. Prevents connection exhaustion under load.
- **Production query logging off**: Prisma now logs only `warn`/`error` in production (was logging every SQL query).
- **Race conditions fixed** (check-then-act → atomic):
  - Bed allocation claims the bed with a conditional `updateMany` (only if still vacant) — no more double-booked beds.
  - Queue numbering (check-in + walk-in) and appointment slot booking now run inside serializable transactions with retry (`src/lib/dbRetry.ts`) — no more duplicate queue numbers or double-booked slots.
- **Hospital-friendly rate limiting**: protected-route limiter is keyed per **authenticated user** instead of per IP (hospitals share one NAT IP); login limiter is keyed per **account/email**; a dedicated, generous `refreshLimiter` covers `POST /api/auth/refresh`.
- **Defensive pagination**: `GET /api/appointments` is capped (default 500, max 1000) with optional `?page`/`?limit` to prevent unbounded result sets.

> Note: server-side sessions and rate-limit counters are still **in-memory**, so the backend should run as a **single instance**. Running multiple instances requires moving both to a shared store (e.g. Redis).

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
