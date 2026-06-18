import { describe, it, expect } from 'vitest';
import { validateCsvColumns } from './csv-validator';
import type { BulkActionType } from '../types/admin';

describe('csv-validator', () => {
  describe('validateCsvColumns', () => {
    it('returns invalid with no missing columns for empty rows array', () => {
      const result = validateCsvColumns([], 'suspend');
      expect(result.valid).toBe(false);
      expect(result.missingColumns).toEqual([]);
    });

    it('returns invalid with no missing columns for unknown action type', () => {
      const result = validateCsvColumns([{ email: 'test@example.com' }], 'unknown_action' as BulkActionType);
      expect(result.valid).toBe(false);
      expect(result.missingColumns).toEqual([]);
    });

    it('validates correctly when all required canonical columns are present', () => {
      const rows = [{ email: 'test@example.com' }];
      const result = validateCsvColumns(rows, 'suspend');
      expect(result.valid).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });

    it('validates correctly when all required English alias columns are present', () => {
      // signature_push requires ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon']
      // Aliases are 'first_name', 'last_name', 'title', 'institution_name', 'phone'
      const rows = [{
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        title: 'Developer',
        institution_name: 'Acme',
        phone: '123'
      }];
      const result = validateCsvColumns(rows, 'signature_push');
      expect(result.valid).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });

    it('returns invalid and lists missing columns when required columns are missing', () => {
      const rows = [{
        email: 'test@example.com',
        ad: 'John',
        // missing soyad
        unvan: 'Developer',
        // missing kurum_adi
        telefon: '123'
      }];
      const result = validateCsvColumns(rows, 'signature_push');
      expect(result.valid).toBe(false);
      expect(result.missingColumns).toEqual(['soyad', 'kurum_adi']);
    });

    it('handles mixed Turkish and English columns correctly', () => {
      const rows = [{
        email: 'test@example.com',
        first_name: 'John', // en alias for ad
        soyad: 'Doe',       // tr canonical
        title: 'Developer', // en alias for unvan
        kurum_adi: 'Acme',  // tr canonical
        phone: '123'        // en alias for telefon
      }];
      const result = validateCsvColumns(rows, 'signature_push');
      expect(result.valid).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });

    it('ignores extra columns that are not required', () => {
      const rows = [{
        email: 'test@example.com',
        extra_column: 'extra',
        another_one: 'another'
      }];
      const result = validateCsvColumns(rows, 'suspend');
      expect(result.valid).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });

    it('handles uppercase or padded headers correctly based on canonicalization', () => {
      const rows = [{
        ' EMAIL ': 'test@example.com',
        '  First_Name': 'John',
        'SOYAD': 'Doe',
        ' TITLE': 'Dev',
        'Kurum_Adi ': 'Acme',
        'PHONE ': '123'
      }];
      const result = validateCsvColumns(rows, 'signature_push');
      expect(result.valid).toBe(true);
      expect(result.missingColumns).toEqual([]);
    });
  });
});
