# Database Schema Documentation

This document describes the database schema relationships in OltraHMS.

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    User Management                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│    ┌──────────┐         ┌────────────┐                                                   │
│    │   User   │ 1 : 1   │  Patient   │  1 : N   ┌──────────────┐                     │
│    ├──────────┤────────►├────────────┤──────────►│ Appointment  │                     │
│    │ id        │         │ id          │           ├──────────────┤                     │
│    │ email     │         │ userId (FK)│           │ patientId (FK│                     │
│    │ role      │         │ patientNumber          │ doctorId (FK)│                     │
│    │ passwordHash      │ firstName │           │ appointmentDate           │
│    │ status   │         │ lastName  │           │ status      │                     │
│    │ isDeleted│         │ phone     │           └──────┬───────┘                     │
│    └──────────┘         └─────┬──────┘                │                               │
│                               │                        │                               │
│                               │ 1 : 1                 │ 1 : N                         │
│                               ▼                        ▼                               │
│                        ┌───────────┐         ┌──────────────┐                         │
│                        │   Staff   │◄────────│MedicalRecord │                         │
│                        ├───────────┤         ├──────────────┤                         │
│                        │ id        │ 1 : N   │ id           │                         │
│                        │ userId(FK)│         │ patientId(FK)│                         │
│                        │ staffNumber          │ doctorId(FK) │                         │
│                        │ departmentId         │ appointmentId │                         │
│                        │ specialization       │ visitDate    │                         │
│                        │ hireDate             └──────┬───────┘                         │
│                        │ isDeleted                      │                               │
│                        └───────────┘                      │                               │
│                                                              │ 1 : N                        │
│                                                              ▼                               │
│                                                       ┌─────────────┐                    │
│                                                       │ Prescription│                    │
│                                                       ├─────────────┤                    │
│                                                       │ id          │                    │
│                                                       │ patientId   │                    │
│                                                       │ medicalRecordId              │
│                                                       │ medicationName               │
│                                                       │ dosage                        │
│                                                       │ refillsRemaining             │
│                                                       └─────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Core Models

### User
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | String | Unique email address |
| firstName | String? | User's first name |
| lastName | String? | User's last name |
| passwordHash | String | Hashed password |
| role | Enum | ADMIN, DOCTOR, NURSE, RECEPTIONIST, PATIENT |
| status | Enum | ACTIVE, INACTIVE, SUSPENDED |
| twoFactorEnabled | Boolean | 2FA enabled status (default: false) |
| twoFactorSecret | String? | Encrypted TOTP secret (AES-256-CBC) |
| failedLoginAttempts | Integer | Failed login attempt counter |
| lockUntil | DateTime? | Account lockout timestamp |
| isDeleted | Boolean | Soft delete flag |
| deletedAt | DateTime? | Soft delete timestamp |

**Security Notes:**
- Passwords are hashed using bcrypt with cost factor 12
- 2FA secrets are encrypted using AES-256-CBC before storage
- Account lockout occurs after 5 failed login attempts for 15 minutes

**Relationships:**
- One-to-One with Patient
- One-to-One with Staff
- One-to-Many with AuditLog

### Patient
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | Foreign key to User |
| patientNumber | String | Unique patient identifier (HMS-YYYY-NNNNNN) |
| firstName | String | Patient's first name |
| lastName | String | Patient's last name |
| dateOfBirth | DateTime | Date of birth |
| gender | Enum | MALE, FEMALE, OTHER |
| phone | String | Contact number |
| address | String? | Home address |

**Relationships:**
- One-to-One with User
- One-to-Many with Appointment
- One-to-Many with MedicalRecord
- One-to-Many with Prescription

### Staff
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | Foreign key to User |
| staffNumber | String | Unique staff identifier |
| departmentId | UUID? | Foreign key to Department |
| specialization | String? | Doctor's specialization |
| qualification | String? | Professional qualifications |
| hireDate | DateTime | Employment start date |
| employmentStatus | Enum | ACTIVE, ON_LEAVE, TERMINATED |
| isDeleted | Boolean | Soft delete flag |

**Relationships:**
- One-to-One with User
- Many-to-One with Department

### Appointment
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| doctorId | UUID | Foreign key to Staff |
| appointmentDate | DateTime | Date of appointment |
| startTime | DateTime | Start time |
| endTime | DateTime | End time |
| type | Enum | FIRST_VISIT, FOLLOW_UP, CONSULTATION, etc. |
| status | Enum | REQUESTED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW |
| reason | String? | Reason for visit |

**Indexes:**
- patientId
- doctorId
- appointmentDate
- status

### MedicalRecord
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| doctorId | UUID | Foreign key to Staff |
| appointmentId | UUID? | Foreign key to Appointment |
| visitDate | DateTime | Date of visit |
| subjective | JSON | SOAP: Patient's complaints |
| objective | JSON | SOAP: Examination findings |
| assessment | JSON | SOAP: Diagnosis |
| plan | JSON | SOAP: Treatment plan |

**Indexes:**
- patientId
- doctorId
- visitDate

### Prescription
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| medicalRecordId | UUID | Foreign key to MedicalRecord |
| medicationName | String | Name of medication |
| genericName | String? | Generic name |
| dosage | String | Dosage amount |
| frequency | String | How often to take |
| route | Enum | ORAL, IV, IM, TOPICAL, etc. |
| duration | Int | Duration in days |
| quantity | Int | Quantity prescribed |
| refills | Int | Number of refills allowed |
| refillsRemaining | Int? | Remaining refills |
| lastRefillDate | DateTime? | Last refill timestamp |
| nextRefillDate | DateTime? | Next refill suggestion |
| status | Enum | PENDING, ACTIVE, COMPLETED, CANCELLED |

### RefillRequest
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| prescriptionId | UUID | Foreign key to Prescription |
| patientId | UUID | Foreign key to Patient |
| requestedAt | DateTime | Request timestamp |
| processedAt | DateTime? | Processing timestamp |
| status | Enum | PENDING, APPROVED, DENIED, COMPLETED |
| notes | String? | Notes from pharmacist |
| processedById | UUID? | Foreign key to Staff |

## Finance Models

### Invoice
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| invoiceNumber | String | Unique invoice number |
| patientId | UUID | Foreign key to Patient |
| items | JSON | Array of invoice items |
| totalAmount | Float | Total amount |
| currency | String | Currency (NGN, USD) |
| status | Enum | PENDING, PAID, OVERDUE, CANCELLED |
| dueDate | DateTime | Payment due date |

### Payment
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| invoiceId | UUID | Foreign key to Invoice |
| amount | Float | Payment amount |
| method | Enum | CASH, CARD, TRANSFER, INSURANCE |
| status | Enum | PENDING, COMPLETED, FAILED |
| transactionId | String? | External transaction ID |

### Refund
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| paymentId | UUID | Foreign key to Payment |
| amount | Float | Refund amount |
| method | Enum | CASH, CARD, TRANSFER |
| reason | String? | Reason for refund |
| status | Enum | PENDING, PROCESSED, FAILED |
| processedAt | DateTime? | Processing timestamp |
| processedById | UUID? | Foreign key to Staff |

## Wellness Models

### WellnessGoal
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| type | Enum | WEIGHT, EXERCISE, WATER, SLEEP, MEDICATION |
| title | String | Goal title |
| targetValue | Float | Target value |
| currentValue | Float | Current progress |
| startDate | DateTime | Start date |
| endDate | DateTime? | End date |
| status | Enum | ACTIVE, COMPLETED, CANCELLED |

### WellnessVitals
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| bloodPressure | String? | Blood pressure reading |
| heartRate | Int? | Heart rate bpm |
| temperature | Float? | Body temperature |
| weight | Float? | Weight in kg |
| height | Float? | Height in cm |
| oxygenSaturation | Int? | SpO2 percentage |
| recordedAt | DateTime | Recording timestamp |

### WellnessMedication
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| medicationName | String | Medication name |
| dosage | String | Dosage |
| frequency | String | Frequency |
| takenAt | DateTime? | Last taken timestamp |
| status | Enum | ACTIVE, COMPLETED, STOPPED |

### WellnessMood
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| mood | Enum | GREAT, GOOD, OKAY, BAD, TERRIBLE |
| notes | String? | Notes |
| recordedAt | DateTime | Recording timestamp |

### WellnessSleep
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| hours | Float | Hours slept |
| quality | Enum | EXCELLENT, GOOD, FAIR, POOR |
| recordedAt | DateTime | Recording date |

### WellnessSymptom
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| symptom | String | Symptom description |
| severity | Enum | MILD, MODERATE, SEVERE |
| notes | String? | Notes |
| recordedAt | DateTime | Recording timestamp |

### WellnessReminder
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| type | Enum | MEDICATION, APPOINTMENT, WELLNESS |
| title | String | Reminder title |
| scheduledAt | DateTime | Scheduled time |
| isCompleted | Boolean | Completion status |

## Radiology Models

### RadiologyRequest
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| doctorId | UUID | Foreign key to Staff |
| procedure | String | Imaging procedure |
| status | Enum | PENDING, IN_PROGRESS, COMPLETED |
| priority | Enum | ROUTINE, URGENT, EMERGENCY |
| report | String? | Radiologist report |
| requestedAt | DateTime | Request timestamp |
| completedAt | DateTime? | Completion timestamp |

## Surgery Models

### Surgery
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| surgeonId | UUID | Foreign key to Staff |
| theaterId | UUID | Foreign key to Theater |
| procedure | String | Surgical procedure |
| scheduledAt | DateTime | Scheduled time |
| status | Enum | SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED |
| notes | String? | Surgical notes |

### Theater
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Theater name/number |
| location | String | Location |
| isAvailable | Boolean | Availability status |

## HR Models

### LeaveBalance
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| staffId | UUID | Foreign key to Staff |
| leaveTypeId | UUID | Foreign key to LeaveType |
| year | Int | Year |
| daysAvailable | Int | Days available |
| daysUsed | Int | Days used |

### LeaveType
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Leave type name |
| daysAllowed | Int | Days allowed per year |

## Inpatient Models

### Admission
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| patientId | UUID | Foreign key to Patient |
| bedId | UUID | Foreign key to Bed |
| admittedAt | DateTime | Admission timestamp |
| dischargedAt | DateTime? | Discharge timestamp |
| diagnosis | String? | Admission diagnosis |
| depositAmount | Float? | Deposit paid |
| status | Enum | ADMITTED, DISCHARGED, TRANSFERRED |

### Ward
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Ward name |
| departmentId | UUID? | Foreign key to Department |
| floor | Int? | Floor number |

### Bed
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| wardId | UUID | Foreign key to Ward |
| bedNumber | String | Bed identifier |
| pricePerDay | Float | Daily rate |
| currency | String | Currency (NGN, USD) |
| status | Enum | AVAILABLE, OCCUPIED, MAINTENANCE |

## Audit Models
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID? | User who performed action |
| action | String | Action type (CREATE, UPDATE, DELETE) |
| details | String? | Detailed description |
| entityType | String? | Type of entity affected |
| entityId | UUID? | ID of affected entity |
| changes | JSON? | Before/after values |
| ipAddress | String? | Client IP |
| timestamp | DateTime | When action occurred |

**Note:** For high-volume logging, consider PostgreSQL table partitioning by timestamp.

## Indexes Summary

| Model | Indexed Fields |
|-------|---------------|
| User | email |
| Patient | userId, firstName+lastName, patientNumber, phone |
| Staff | userId, staffNumber, departmentId |
| Appointment | patientId, doctorId, appointmentDate, status |
| MedicalRecord | patientId, doctorId, visitDate |
| Prescription | patientId, status, nextRefillDate |
| AuditLog | userId, timestamp, entityType+entityId |

## Soft Delete

The following models support soft delete:
- User (isDeleted, deletedAt)
- Patient (isDeleted, deletedAt)
- Staff (isDeleted, deletedAt)

When querying, filter out deleted records:
```typescript
const patients = await prisma.patient.findMany({
  where: { isDeleted: false }
});
```
