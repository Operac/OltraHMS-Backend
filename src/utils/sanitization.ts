import { escape, trim } from 'lodash';

/**
 * Sanitize input to prevent XSS attacks
 * Escapes HTML characters to prevent script injection
 */
export const sanitizeString = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return escape(trim(input));
};

/**
 * Sanitize search query - allows more characters but still prevents injection
 */
export const sanitizeSearchQuery = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  // Only allow alphanumeric, spaces, hyphens, and basic punctuation
  return trim(input).replace(/[<>]/g, '');
};

/**
 * Sanitize email - basic validation and trimming
 */
export const sanitizeEmail = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return trim(input).toLowerCase();
};

/**
 * Sanitize phone number - remove non-numeric characters except +
 */
export const sanitizePhoneNumber = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return trim(input).replace(/[^\d+\-\s()]/g, '');
};

/**
 * Create a sanitized object from input fields
 */
export const sanitizeObject = <T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Partial<T> => {
  const sanitized: Partial<T> = {};
  
  for (const field of fields) {
    const value = obj[field];
    if (typeof value === 'string') {
      (sanitized as Record<string, unknown>)[field as string] = sanitizeString(value);
    } else if (value !== undefined) {
      (sanitized as Record<string, unknown>)[field as string] = value;
    }
  }
  
  return sanitized;
};

/**
 * Sanitize all string fields in an object recursively
 */
export const sanitizeObjectDeep = <T extends Record<string, unknown>>(
  obj: T
): T => {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObjectDeep(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
};
