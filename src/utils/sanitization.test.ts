import { describe, it, expect } from 'vitest';
import { 
  sanitizeString, 
  sanitizeSearchQuery, 
  sanitizeEmail, 
  sanitizePhoneNumber,
  sanitizeObject,
  sanitizeObjectDeep
} from './sanitization';

describe('Sanitization Utilities', () => {
  describe('sanitizeString', () => {
    it('should escape HTML characters', () => {
      // lodash escape properly escapes HTML - this is correct behavior for XSS prevention
      // Input: <script>alert("xss")</script>
      // lodash escape properly escapes HTML - this is correct behavior for XSS prevention
      // Input: <script>alert("xss")</script>
      // Output: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;
      const result = sanitizeString('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should trim whitespace', () => {
      const result = sanitizeString('  hello world  ');
      expect(result).toBe('hello world');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
      expect(sanitizeString(123 as any)).toBe('');
    });

    it('should handle empty string', () => {
      const result = sanitizeString('');
      expect(result).toBe('');
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should remove angle brackets', () => {
      const result = sanitizeSearchQuery('<script>alert(1)</script>test');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should preserve alphanumeric and common punctuation', () => {
      const result = sanitizeSearchQuery("John O'Brien-Smith 123");
      expect(result).toBe("John O'Brien-Smith 123");
    });

    it('should trim whitespace', () => {
      const result = sanitizeSearchQuery('  search term  ');
      expect(result).toBe('search term');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeSearchQuery(null as any)).toBe('');
      expect(sanitizeSearchQuery(undefined as any)).toBe('');
    });
  });

  describe('sanitizeEmail', () => {
    it('should lowercase and trim email', () => {
      const result = sanitizeEmail('  TEST@EXAMPLE.COM  ');
      expect(result).toBe('test@example.com');
    });

    it('should handle non-string input', () => {
      expect(sanitizeEmail(null as any)).toBe('');
      expect(sanitizeEmail(undefined as any)).toBe('');
    });
  });

  describe('sanitizePhoneNumber', () => {
    it('should trim and preserve valid phone characters', () => {
      const result = sanitizePhoneNumber('+1 (234) 567-8900');
      // Phone number keeps some punctuation as valid
      expect(result).toContain('+1');
    });

    it('should handle non-string input', () => {
      expect(sanitizePhoneNumber(null as any)).toBe('');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize specified string fields using lodash escape', () => {
      const obj = {
        name: '  <script>alert(1)</script>John  ',
        age: 30,
        email: 'test@example.com',
      };
      
      const result = sanitizeObject(obj, ['name']);
      
      // lodash escape escapes HTML - this is correct XSS prevention
      // Input: <script>alert(1)</script>John
      // Output: &lt;script&gt;alert(1)&lt;/script&gt;John
      expect(result.name).toBe('&lt;script&gt;alert(1)&lt;/script&gt;John');
      // Note: sanitizeObject only returns the specified fields, not the full object
      expect(result.age).toBeUndefined();
      expect(result.email).toBeUndefined();
    });

    it('should only sanitize specified fields', () => {
      const obj = {
        field1: '<script>',
        field2: '<script>',
      };
      
      const result = sanitizeObject(obj, ['field1']);
      
      // field1 is escaped, field2 is not
      // sanitizeObject only returns the specified fields
      expect(result.field1).toBe('&lt;script&gt;');
      expect(result.field2).toBeUndefined();
    });
  });

  describe('sanitizeObjectDeep', () => {
    it('should recursively sanitize nested objects', () => {
      const obj = {
        name: '<script>alert(1)</script>',
        contact: {
          email: '  TEST@EXAMPLE.COM  ',
          phone: '+1 (234) 567-8900',
        },
        tags: ['<tag1>', '<tag2>'],
      };
      
      const result = sanitizeObjectDeep(obj);
      
      // lodash escape properly escapes HTML
      // Input: <script>alert(1)</script>
      // Output: &lt;script&gt;alert(1)&lt;/script&gt;
      expect(result.name).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      // sanitizeObjectDeep uses sanitizeString which uses lodash escape (not lowercase)
      expect((result.contact as any).email).toBe('TEST@EXAMPLE.COM');
      // Tags are escaped: <tag1> -> &lt;tag1&gt;
      expect((result.tags as any)[0]).toBe('&lt;tag1&gt;');
    });

    it('should preserve non-string values', () => {
      const obj = {
        count: 42,
        active: true,
        rate: 3.14,
        items: [1, 2, 3],
      };
      
      const result = sanitizeObjectDeep(obj);
      
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.rate).toBe(3.14);
      expect(result.items).toEqual([1, 2, 3]);
    });

    it('should handle arrays of strings', () => {
      const obj = {
        tags: ['<tag1>', '<tag2>', 'normal'],
      };
      
      const result = sanitizeObjectDeep(obj);
      
      // lodash escape escapes HTML tags
      // Input: <tag1> -> Output: &lt;tag1&gt;
      expect((result.tags as any)[0]).toBe('&lt;tag1&gt;');
      expect((result.tags as any)[1]).toBe('&lt;tag2&gt;');
      expect((result.tags as any)[2]).toBe('normal');
    });
  });
});
