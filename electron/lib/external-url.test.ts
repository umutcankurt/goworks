import { describe, it, expect } from 'vitest';
import { isAllowedExternalUrl } from './external-url';

describe('isAllowedExternalUrl — host allowlist (F-11)', () => {
    it('allows the Google hosts the app actually links to', () => {
        for (const url of [
            'https://console.cloud.google.com/apis/library/admin.googleapis.com',
            'https://policies.google.com/privacy',
            'https://workspace.google.com/terms/premier_terms/',
            'https://admin.google.com/ac/owl/domainwidedelegation',
        ]) {
            expect(isAllowedExternalUrl(url)).toBe(true);
        }
    });

    it('rejects an arbitrary host', () => {
        expect(isAllowedExternalUrl('https://evil.tld/phish')).toBe(false);
    });

    it('rejects a lookalike suffix host', () => {
        // The reason this parses instead of substring-matching.
        expect(isAllowedExternalUrl('https://console.cloud.google.com.evil.tld/')).toBe(false);
    });

    it('rejects userinfo smuggling', () => {
        expect(isAllowedExternalUrl('https://console.cloud.google.com@evil.tld/')).toBe(false);
    });

    it('rejects non-https schemes even on an allowed host', () => {
        expect(isAllowedExternalUrl('http://admin.google.com/')).toBe(false);
        expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
        expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects unparseable input instead of throwing', () => {
        expect(isAllowedExternalUrl('not a url')).toBe(false);
        expect(isAllowedExternalUrl('')).toBe(false);
    });
});
