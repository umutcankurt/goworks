import { describe, it, expect } from 'vitest';
import { UserFacingError, isUserFacingError } from './errors';

describe('errors', () => {
    describe('UserFacingError', () => {
        it('should correctly set properties', () => {
            const error = new UserFacingError('Test message');
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe('UserFacingError');
            expect(error.message).toBe('Test message');
            expect(error.isUserFacing).toBe(true);
        });

        it('should capture stack trace', () => {
            const error = new UserFacingError('Test message');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('UserFacingError: Test message');
        });
    });

    describe('isUserFacingError', () => {
        it('should return true for UserFacingError', () => {
            const error = new UserFacingError('Test message');
            expect(isUserFacingError(error)).toBe(true);
        });

        it('should return false for generic Error', () => {
            const error = new Error('Test message');
            expect(isUserFacingError(error)).toBe(false);
        });

        it('should return false for Error with isUserFacing=false', () => {
            const error = new Error('Test message') as Error & { isUserFacing?: boolean };
            error.isUserFacing = false;
            expect(isUserFacingError(error)).toBe(false);
        });

        it('should return true for Error-like object with isUserFacing=true', () => {
             // Depending on the exact implementation this might be true or false.
             // implementation: return err instanceof Error && (err as Error & { isUserFacing?: boolean }).isUserFacing === true;
             // so if we mock an Error it should be true.
             class MockError extends Error {
                 isUserFacing = true;
             }
             const error = new MockError('mock');
             expect(isUserFacingError(error)).toBe(true);
        });

        it('should return false for string', () => {
            expect(isUserFacingError('string error')).toBe(false);
        });

        it('should return false for plain object', () => {
            expect(isUserFacingError({ message: 'error', isUserFacing: true })).toBe(false); // Fails instanceof Error
        });

        it('should return false for null/undefined', () => {
            expect(isUserFacingError(null)).toBe(false);
            expect(isUserFacingError(undefined)).toBe(false);
        });
    });
});
