# OltraHMS Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OltraHMS Hospital Management System                │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │   Frontend      │
                                    │   (React +      │
                                    │    Vite)        │
                                    └────────┬────────┘
                                             │
                                             │ HTTPS
                                             │
                                    ┌────────▼────────┐
                                    │   Backend API    │
                                    │   (Express.js)  │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
           ┌────────▼────────┐      ┌────────▼────────┐      ┌────────▼────────┐
           │  PostgreSQL    │      │     Redis      │      │   Cloudinary   │
           │  Database      │      │    (Cache)     │      │   (Files)       │
           └─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Backend Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Backend Server                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Express.js Server                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │  │
│  │  │  Routes    │  │Controllers │  │ Middleware │  │  Services   │   │  │
│  │  │            │  │            │  │            │  │            │   │  │
│  │  │ - auth     │  │ - auth     │  │ - auth    │  │ - email    │   │  │
│  │  │ - patient  │  │ - patient  │  │ - rate    │  │ - notif.   │   │  │
│  │  │ - appoint. │  │ - appoint. │  │   limit   │  │ - audit    │   │  │
│  │  │ - doctor  │  │ - doctor  │  │ - helmet  │  │ - patient  │   │  │
│  │  │ - lab     │  │ - lab     │  │ - cors    │  │ - waitlist │   │  │
│  │  │ - pharma. │  │ - pharma. │  │           │  │            │   │  │
│  │  └─────┬──────┘  └─────┬──────┘  └────────────┘  └─────┬──────┘   │  │
│  │        │                │                                 │          │  │
│  │        └────────────────┼─────────────────────────────────┘          │  │
│  │                         │                                            │  │
│  │                  ┌──────▼──────┐                                     │  │
│  │                  │   Prisma    │                                     │  │
│  │                  │   ORM       │                                     │  │
│  │                  └──────┬──────┘                                     │  │
│  │                         │                                            │  │
│  └─────────────────────────┼────────────────────────────────────────────┘  │
│                            │                                               │
└────────────────────────────┼───────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  PostgreSQL     │
                    │  Database       │
                    └─────────────────┘
```

## Security

### Authentication & Authorization
- JWT-based authentication with short-lived access tokens (15 minutes) and refresh tokens (7 days)
- Role-based access control (RBAC) with configurable permissions per role
- Account lockout after 5 failed login attempts (15-minute lockout)

### Two-Factor Authentication (2FA)
- TOTP-based 2FA using authenticator apps (Google Authenticator, Authy, etc.)
- 2FA secrets encrypted with AES-256-CBC using a dedicated `ENCRYPTION_SECRET`
- Backup codes generated for account recovery

### Password Security
- Bcrypt hashing with cost factor 12
- Password validation requiring uppercase, lowercase, number, and special character
- Secure password reset flow with time-limited tokens

### API Security
- Rate limiting on authentication endpoints (10 requests/15 min)
- Strict rate limiting for login failures (5 attempts/hour)
- General API rate limit (100 requests/minute)
- Helmet.js for security headers
- CORS with explicit origin whitelist
- Input validation using Zod schemas
- Input sanitization for XSS prevention

### Audit Logging
- Comprehensive audit trail for:
  - Authentication events (login, logout, password changes, 2FA setup)
  - Patient data access and modifications
  - Medical record operations
  - Billing and payment processing
  - Administrative actions

## Database Schema Relationships

### Core Entities

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │       │   Patient   │       │    Staff    │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id          │◄──────│ userId      │       │ id          │
│ email       │       │ id          │◄──────│ userId      │
│ passwordHash│       │ patientNumber│      │ staffNumber │
│ role        │       │ firstName   │       │ departmentId│
│ status      │       │ lastName    │       │ specialization
│ isDeleted   │       │ dateOfBirth │       │ hireDate    │
└──────┬──────┘       │ gender      │       │ isDeleted   │
       │              │ phone       │       └──────┬──────┘
       │              └──────┬──────┘              │
       │                     │                     │
       │              ┌──────▼──────┐              │
       │              │ Appointment │              │
       │              ├─────────────┤              │
       │              │ patientId   │              │
       │              │ doctorId    │──────────────┘
       │              │ appointmentDate
       │              │ status
       │              └──────┬──────┘
       │                     │
       │         ┌───────────┼───────────┐
       │         │           │           │
       │   ┌─────▼─────┐ ┌──▼────┐ ┌───▼─────┐
       │   │MedicalRec.│ │ Lab   │ │Prescrip.│
       │   │           │ │ Order │ │         │
       │   │ patientId │ │       │ │ patientId│
       │   │ doctorId  │ │       │ │ medicalId│
       │   │ appointId │ │       │ │         │
       │   └───────────┘ └───────┘ └─────────┘
       │
       │
┌──────▼──────┐
│  AuditLog   │
├─────────────┤
│ id          │
│ userId      │
│ action      │
│ entityType  │
│ entityId    │
│ timestamp   │
└─────────────┘
```

## API Flow

```
Client Request
      │
      ▼
┌─────────────────┐
│  Rate Limiter   │ ────► 429 Too Many Requests
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Auth Middleware│ ────► 401 Unauthorized
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Route      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Controller   │
│  (Validation)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Service     │
│  (Business     │
│   Logic)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Prisma ORM   │
│   (Database)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Response     │
└─────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Express.js, TypeScript, Node.js |
| Database | PostgreSQL, Prisma ORM |
| Cache | Redis |
| File Storage | Cloudinary |
| Authentication | JWT, bcrypt |
| Email | Nodemailer |
| Real-time | Socket.io |
| PDF Generation | PDFKit |
 | Testing | Playwright, Vitest |

## User Roles

| Role | Description |
|------|-------------|
| ADMIN | System administration, staff management, audit logs |
| DOCTOR | Patient consultations, medical records, prescriptions |
| NURSE | Patient care, vital signs, medication administration |
| RADIOLOGIST | Imaging requests and reports |
| RECEPTIONIST | Patient registration, appointment booking, check-in |
| PHARMACIST | Medication dispensing, inventory management |
| LAB_TECHNICIAN | Lab order processing, results entry |
| ACCOUNTANT | Billing, payments, payroll, financial reports |
| PATIENT | Portal access, appointments, wellness tracking |

## Security Architecture

```
├─────────────────────────────────────────────────────────────────┤
│                      Security Layers                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Network Security                                       │  │
│  │    - HTTPS/TLS                                            │  │
│  │    - CORS whitelist                                       │  │
│  │    - Helmet.js headers                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Authentication                                         │  │
│  │    - JWT tokens                                          │  │
│  │    - Password hashing (bcrypt)                           │  │
│  │    - Rate limiting                                       │  │
│  │    - Two-Factor Authentication (TOTP)                    │  │
│  │    - 2FA secrets encrypted (AES-256-CBC)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Authorization                                         │  │
│  │    - Role-based access control (RBAC)                   │  │
│  │    - Route-level guards                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Data Protection                                        │  │
│  │    - Input sanitization                                  │  │
│  │    - SQL injection prevention (Prisma)                   │  │
│  │    - XSS prevention                                      │  │
│  │    - Secure password generation (crypto.randomBytes)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. Financial Controls                                     │  │
│  │    - Payment verification before dispensing             │  │
│  │    - Unique invoice number generation (timestamp+hex)   │  │
│  │    - FEFO batch selection for inventory                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
                              ┌─────────────────────┐
                              │     Load Balancer   │
                              │   (Cloud Provider)  │
                              └──────────┬──────────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     │                   │                   │
              ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │  Backend 1  │    │  Backend 2  │    │  Backend N  │
              │  (Node.js) │    │  (Node.js) │    │  (Node.js) │
              └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
                     │                   │                   │
                     └───────────────────┼───────────────────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     │                   │                   │
              ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │ PostgreSQL  │    │    Redis    │    │ Cloudinary  │
              │  Primary    │    │   Cluster   │    │   (CDN)     │
              └─────────────┘    └─────────────┘    └─────────────┘
```
