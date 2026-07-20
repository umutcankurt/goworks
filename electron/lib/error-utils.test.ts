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

describe('toUserMessage — Google oturum hatası eyleme dönüştürülür', () => {
    const SESSION = 'Google oturumunuz sona erdi. Lütfen tekrar giriş yapın.';

    it('maps the exact error the Directory API returns for a dead token', () => {
        // Verbatim from a real app-2026-07-20.log entry: the user searched the
        // Users page and got "Beklenmeyen hata oluştu" for this.
        const err = new Error(
            'Request had invalid authentication credentials. Expected OAuth 2 access token, '
            + 'login cookie or other valid authentication credential.',
        );
        expect(toUserMessage(err)).toBe(SESSION);
    });

    it('maps a 401 regardless of wording', () => {
        expect(toUserMessage(Object.assign(new Error('boom'), { code: 401 }))).toBe(SESSION);
        expect(toUserMessage(Object.assign(new Error('boom'), { response: { status: 401 } }))).toBe(SESSION);
    });

    it('maps a revoked refresh token and an empty client', () => {
        expect(toUserMessage(new Error('invalid_grant'))).toBe(SESSION);
        expect(toUserMessage(new Error('No access, refresh token, API key or refresh handler callback is set.')))
            .toBe(SESSION);
    });

    it('leaves a 403 generic — that is authorization, not authentication', () => {
        // Telling a demoted admin to sign in again sends them round a loop that
        // cannot help. Different problem, different remedy.
        const err = Object.assign(new Error('Not Authorized to access this resource/api'), { code: 403 });
        expect(toUserMessage(err)).toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
    });

    it('still genericises an unrelated system error', () => {
        expect(toUserMessage(new Error("ENOENT: no such file or directory, open '/Users/x/vault.enc'")))
            .toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
    });

    it('does not crash on non-objects', () => {
        expect(toUserMessage('invalid_grant')).toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
        expect(toUserMessage(null)).toBe('Beklenmeyen hata oluştu. Detaylar log dosyasındadır.');
    });
});
