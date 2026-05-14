
import { describe, it, expect } from 'vitest';
import { parseUserCsv } from './csv-parser';

describe('parseUserCsv', () => {
    it('should parse a valid CSV file with normalized keys', async () => {
        const content = 'Email,Name\nuser@example.com,User One\nuser2@example.com,User Two';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].email).toBe('user@example.com');
        expect(result.data[0].name).toBe('User One');
        expect(result.data[1].email).toBe('user2@example.com');
        expect(result.errors).toHaveLength(0);
    });

    it('should parse CSV without requiring Email column', async () => {
        const content = 'Name,Age\nUser One,30';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('User One');
        expect(result.errors).toHaveLength(0);
    });

    it('should handle empty rows gracefully', async () => {
        const content = 'Email\nuser@example.com\n\nuser2@example.com';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
    });

    it('should normalize column names to lowercase', async () => {
        const content = 'EMAIL,Ad,SoyAd\ntest@test.com,Ali,Yilmaz';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(1);
        expect(result.data[0].email).toBe('test@test.com');
        expect(result.data[0].ad).toBe('Ali');
        expect(result.data[0].soyad).toBe('Yilmaz');
    });

    it('should trim values', async () => {
        const content = 'email,ad\n  test@test.com  , Ali ';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(1);
        expect(result.data[0].email).toBe('test@test.com');
        expect(result.data[0].ad).toBe('Ali');
    });

    it('should skip rows with all empty values', async () => {
        const content = 'email,ad\ntest@test.com,Ali\n,\ntest2@test.com,Veli';
        const file = new File([content], 'users.csv', { type: 'text/csv' });

        const result = await parseUserCsv(file);

        expect(result.data).toHaveLength(2);
    });
});
