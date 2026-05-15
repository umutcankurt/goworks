import { describe, it, expect } from 'vitest';
import { toUserMessage, formatErrorForLog, ok, fail } from './error-utils';
import { UserFacingError } from './errors';

describe('error-utils', () => {
    describe('toUserMessage', () => {
        it('UserFacingError mesajını olduğu gibi döner (kullanıcı için hazırlanmış TR)', () => {
            const err = new UserFacingError('Bu kullanıcı zaten askıda.');
            expect(toUserMessage(err)).toBe('Bu kullanıcı zaten askıda.');
        });

        it('generic Error\'u "Beklenmeyen hata" jenerik mesajına çevirir (stack sızmaz)', () => {
            const err = new Error('TypeError: cannot read property foo of undefined');
            expect(toUserMessage(err)).toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
        });

        it('string error\'u jenerik mesaja çevirir', () => {
            expect(toUserMessage('plain text error')).toBe(
                'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.',
            );
        });

        it('null/undefined için jenerik mesaj döner', () => {
            expect(toUserMessage(null)).toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
            expect(toUserMessage(undefined)).toBe(
                'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.',
            );
        });

        it('UserFacingError olmayan ama isUserFacing özelliği taşıyan objeyi user-facing saymaz', () => {
            const fake = { isUserFacing: true, message: 'fake' };
            expect(toUserMessage(fake)).toBe(
                'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.',
            );
        });
    });

    describe('formatErrorForLog', () => {
        it('Error için stack döner', () => {
            const err = new Error('boom');
            const formatted = formatErrorForLog(err);
            expect(formatted).toContain('boom');
            expect(formatted.length).toBeGreaterThan('boom'.length);
        });

        it('null/undefined için string döner', () => {
            expect(formatErrorForLog(null)).toBe('null');
            expect(formatErrorForLog(undefined)).toBe('undefined');
        });

        it('objeyi JSON.stringify eder', () => {
            expect(formatErrorForLog({ code: 429, msg: 'limit' })).toBe(
                '{"code":429,"msg":"limit"}',
            );
        });
    });

    describe('ok / fail constructors', () => {
        it('ok success: true ile data taşır', () => {
            const result = ok({ users: [] });
            expect(result).toEqual({ success: true, data: { users: [] } });
        });

        it('fail UserFacingError mesajını taşır', () => {
            const result = fail(new UserFacingError('Yetki yok'));
            expect(result).toEqual({ success: false, error: 'Yetki yok' });
        });

        it('fail generic error için jenerik mesaj döner', () => {
            const result = fail(new Error('database connection failed at 0x...'));
            expect(result).toEqual({
                success: false,
                error: 'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.',
            });
        });
    });
});
