import { z } from 'zod';

/**
 * Common validation schemas for the HMS application
 */

// Common patterns
const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * User/Auth schemas
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex, 'Password must contain uppercase, lowercase, number and special character'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().regex(phoneRegex, 'Invalid phone number').optional(),
  role: z.enum(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT', 'PHARMACIST', 'LAB_TECH', 'ACCOUNTANT']).optional(),
});

/**
 * Patient schemas
 */
export const patientSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().regex(phoneRegex, 'Invalid phone number'),
  dateOfBirth: z.string().datetime({ message: 'Invalid date format' }),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  address: z.string().max(200).optional(),
  city: z.string().max(50).optional(),
  state: z.string().max(50).optional(),
  country: z.string().max(50).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.string().max(500).optional(),
  chronicConditions: z.string().max(500).optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().regex(phoneRegex).optional(),
  insuranceProvider: z.string().max(100).optional(),
  insurancePolicyNumber: z.string().max(50).optional(),
  insuranceExpiry: z.string().datetime().optional(),
});

export const patientUpdateSchema = patientSchema.partial();

/**
 * Appointment schemas
 */
export const appointmentSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID').optional(),
  doctorId: z.string().uuid('Invalid doctor ID'),
  startTime: z.string().datetime('Invalid start time'),
  endTime: z.string().datetime('Invalid end time'),
  type: z.enum(['FIRST_VISIT', 'FOLLOW_UP', 'CONSULTATION', 'EMERGENCY', 'CHECKUP']),
  reason: z.string().max(500).optional(),
});

export const appointmentUpdateSchema = appointmentSchema.partial();

/**
 * Staff schemas
 */
export const staffSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  departmentId: z.string().uuid('Invalid department ID').optional(),
  specialization: z.string().max(100).optional(),
  licenseNumber: z.string().max(50).optional(),
  position: z.string().max(50).optional(),
  salary: z.number().positive().optional(),
  hireDate: z.string().datetime().optional(),
});

/**
 * Medical Record schemas
 */
export const medicalRecordSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional(),
  diagnosis: z.string().max(1000).optional(),
  symptoms: z.string().max(1000).optional(),
  prescription: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  followUpDate: z.string().datetime().optional(),
});

/**
 * Prescription schemas
 */
export const prescriptionSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional(),
  medications: z.array(z.object({
    name: z.string().min(1, 'Medication name is required'),
    dosage: z.string().min(1, 'Dosage is required'),
    frequency: z.string().min(1, 'Frequency is required'),
    duration: z.string().optional(),
    instructions: z.string().optional(),
  })).min(1, 'At least one medication is required'),
  notes: z.string().max(500).optional(),
});

/**
 * Billing schemas
 */
export const billingSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional(),
  items: z.array(z.object({
    description: z.string().min(1, 'Description is required'),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    total: z.number().positive(),
  })).min(1, 'At least one item is required'),
  paymentMethod: z.enum(['CASH', 'CARD', 'INSURANCE', 'BANK_TRANSFER']).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Department schemas
 */
export const departmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  headId: z.string().uuid('Invalid head ID').optional(),
});

/**
 * Vital Signs schemas
 */
export const vitalSignsSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  temperature: z.number().min(30).max(45).optional(),
  bloodPressureSystolic: z.number().min(60).max(250).optional(),
  bloodPressureDiastolic: z.number().min(30).max(150).optional(),
  heartRate: z.number().min(30).max(250).optional(),
  respiratoryRate: z.number().min(8).max(60).optional(),
  oxygenSaturation: z.number().min(50).max(100).optional(),
  weight: z.number().min(0.5).max(500).optional(),
  height: z.number().min(20).max(300).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Lab Request schemas
 */
export const labRequestSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional(),
  tests: z.array(z.object({
    name: z.string().min(1, 'Test name is required'),
    code: z.string().optional(),
    priority: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
  })).min(1, 'At least one test is required'),
  notes: z.string().max(500).optional(),
  fasting: z.boolean().optional(),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * ID schema for path parameters
 */
export const idSchema = z.object({
  id: z.string().uuid('Invalid ID'),
});

/**
 * UUID schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID');

/**
 * Email schema
 */
export const emailSchema = z.string().email('Invalid email address');

/**
 * Phone schema
 */
export const phoneSchema = z.string().regex(phoneRegex, 'Invalid phone number');

/**
 * Date schema
 */
export const dateSchema = z.string().datetime('Invalid date format');

/**
 * Pagination response helper
 */
export function createPaginationResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
