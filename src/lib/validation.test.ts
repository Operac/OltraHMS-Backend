import { describe, it, expect } from 'vitest';
import { 
  loginSchema, 
  registerSchema, 
  patientSchema, 
  appointmentSchema,
  paginationSchema 
} from './validation';

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'password123',
      };
      
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: '',
      };
      
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'John',
        lastName: 'Doe',
      };
      
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject weak password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject email exceeding max length', () => {
      const invalidData = {
        email: 'a'.repeat(250) + '@example.com',
        password: 'Password1!',
        firstName: 'John',
        lastName: 'Doe',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject firstName exceeding max length', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'a'.repeat(51),
        lastName: 'Doe',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty firstName', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: '',
        lastName: 'Doe',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('patientSchema', () => {
    const validPatientData = {
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+1234567890',
      dateOfBirth: '1990-01-15T00:00:00Z',
      gender: 'FEMALE' as const,
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      country: 'USA',
    };

    it('should validate correct patient data', () => {
      const result = patientSchema.safeParse(validPatientData);
      expect(result.success).toBe(true);
    });

    it('should validate without optional fields', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1234567890',
        dateOfBirth: '1990-01-15T00:00:00Z',
        gender: 'FEMALE' as const,
      };
      
      const result = patientSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid phone format', () => {
      const invalidData = {
        ...validPatientData,
        phone: 'invalid',
      };
      
      const result = patientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid gender', () => {
      const invalidData = {
        ...validPatientData,
        gender: 'INVALID',
      };
      
      const result = patientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject address exceeding max length', () => {
      const invalidData = {
        ...validPatientData,
        address: 'a'.repeat(501),
      };
      
      const result = patientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const invalidData = {
        ...validPatientData,
        dateOfBirth: 'not-a-date',
      };
      
      const result = patientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('appointmentSchema', () => {
    const validAppointmentData = {
      patientId: '123e4567-e89b-12d3-a456-426614174000',
      doctorId: '123e4567-e89b-12d3-a456-426614174001',
      startTime: '2024-03-20T10:00:00Z',
      endTime: '2024-03-20T10:30:00Z',
      type: 'FIRST_VISIT' as const,
      reason: 'Regular checkup',
    };

    it('should validate correct appointment data', () => {
      const result = appointmentSchema.safeParse(validAppointmentData);
      expect(result.success).toBe(true);
    });

    it('should validate without optional patientId', () => {
      const data = {
        doctorId: '123e4567-e89b-12d3-a456-426614174001',
        startTime: '2024-03-20T10:00:00Z',
        endTime: '2024-03-20T10:30:00Z',
        type: 'FIRST_VISIT' as const,
      };
      
      const result = appointmentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        ...validAppointmentData,
        patientId: 'not-a-uuid',
      };
      
      const result = appointmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid appointment type', () => {
      const invalidData = {
        ...validAppointmentData,
        type: 'INVALID_TYPE',
      };
      
      const result = appointmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject reason exceeding max length', () => {
      const invalidData = {
        ...validAppointmentData,
        reason: 'a'.repeat(2001),
      };
      
      const result = appointmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime format', () => {
      const invalidData = {
        ...validAppointmentData,
        startTime: 'not-a-datetime',
      };
      
      const result = appointmentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should use default values when no params provided', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should parse string numbers', () => {
      const result = paginationSchema.safeParse({ 
        page: '2', 
        limit: '50' 
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject limit exceeding max', () => {
      const result = paginationSchema.safeParse({ 
        limit: '200' 
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const result = paginationSchema.safeParse({ 
        page: '-1' 
      });
      expect(result.success).toBe(false);
    });
  });
});
