import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const testDbHolder = vi.hoisted(() => ({ db: null as Database.Database | null }));

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp/goworks-test', isPackaged: false },
}));

vi.mock('../db', () => ({
    getDb: () => testDbHolder.db!,
}));

import { appConfigService } from './app-config-service';

const SCHEMA_PATH = path.join(process.cwd(), 'electron', 'db', 'schema.sql');

const UNLOCKED = { vaultUnlocked: true };
const LOCKED = { vaultUnlocked: false };

beforeEach(() => {
    testDbHolder.db = new Database(':memory:');
    testDbHolder.db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
});

/** Put the install past onboarding, the state in which the vault gate applies. */
function completeOnboarding(): void {
    appConfigService.set('onboardingCompletedAt', new Date().toISOString());
}

describe('appConfigService.setFromRenderer — anahtar allowlist (RC-1)', () => {
    it('accepts the cosmetic branding keys', () => {
        appConfigService.setFromRenderer('companyName', 'ABC Firma', UNLOCKED);
        appConfigService.setFromRenderer('sidebarAbbr', 'ABC', UNLOCKED);
        appConfigService.setFromRenderer('emailSenderName', 'ABC BT', UNLOCKED);

        expect(appConfigService.get('companyName')).toBe('ABC Firma');
        expect(appConfigService.get('sidebarAbbr')).toBe('ABC');
        expect(appConfigService.get('emailSenderName')).toBe('ABC BT');
    });

    it('rejects logoPath — the arbitrary file read + delete primitive', () => {
        expect(() => appConfigService.setFromRenderer('logoPath', '/etc/passwd', UNLOCKED)).toThrow();
        // and nothing was written, so config:getLogoDataUrl has nothing to open
        expect(appConfigService.get('logoPath')).toBeNull();
    });

    it('rejects both OAuth credential keys — they have a dedicated handler', () => {
        expect(() => appConfigService.setFromRenderer('googleClientSecret', 'GOCSPX-x', UNLOCKED)).toThrow();
        expect(() => appConfigService.setFromRenderer('googleClientId', 'x.apps.googleusercontent.com', UNLOCKED)).toThrow();
        expect(appConfigService.get('googleClientSecret')).toBe('');
    });

    it('rejects keys owned by transactional helpers', () => {
        for (const key of ['onboardingCompletedAt', 'termsAcceptedAt', 'termsVersion']) {
            expect(() => appConfigService.setFromRenderer(key, 'x', UNLOCKED)).toThrow();
        }
    });

    it('rejects an unknown key instead of inserting an inert row', () => {
        expect(() => appConfigService.setFromRenderer('whateverKey', 'x', UNLOCKED)).toThrow();
        const row = testDbHolder.db!
            .prepare('SELECT value FROM app_config WHERE key = ?')
            .get('whateverKey');
        expect(row).toBeUndefined();
    });
});

describe('appConfigService.setFromRenderer — kasa kapısı (F-4)', () => {
    it('allows allowedDomain during onboarding, when no vault exists yet', () => {
        // The wizard writes this at the branding step, before master-password.
        appConfigService.setFromRenderer('allowedDomain', 'example.com', LOCKED);
        expect(appConfigService.get('allowedDomain')).toBe('example.com');
    });

    it('requires an unlocked vault for allowedDomain once onboarding is complete', () => {
        appConfigService.set('allowedDomain', 'example.com');
        completeOnboarding();

        expect(() => appConfigService.setFromRenderer('allowedDomain', 'attacker.tld', LOCKED)).toThrow();
        expect(appConfigService.get('allowedDomain')).toBe('example.com');

        appConfigService.setFromRenderer('allowedDomain', 'newdomain.com', UNLOCKED);
        expect(appConfigService.get('allowedDomain')).toBe('newdomain.com');
    });

    it('requires an unlocked vault to disable the idle auto-lock', () => {
        completeOnboarding();

        expect(() => appConfigService.setFromRenderer('autoLockMinutes', '0', LOCKED)).toThrow();
        expect(appConfigService.getAutoLockMinutes()).toBe(60);

        appConfigService.setFromRenderer('autoLockMinutes', '15', UNLOCKED);
        expect(appConfigService.getAutoLockMinutes()).toBe(15);
    });

    it('leaves cosmetic keys writable while the vault is locked', () => {
        completeOnboarding();
        appConfigService.setFromRenderer('companyName', 'Yeni Ad', LOCKED);
        expect(appConfigService.get('companyName')).toBe('Yeni Ad');
    });
});

describe('appConfigService.setFromRenderer — mevcut değer doğrulaması korunur', () => {
    it('still enforces the domain format', () => {
        expect(() => appConfigService.setFromRenderer('allowedDomain', 'not a domain', UNLOCKED)).toThrow();
    });

    it('still enforces the language enum', () => {
        expect(() => appConfigService.setFromRenderer('language', 'de', UNLOCKED)).toThrow();
        appConfigService.setFromRenderer('language', 'en', UNLOCKED);
        expect(appConfigService.get('language')).toBe('en');
    });

    it('still enforces the autoLockMinutes range', () => {
        expect(() => appConfigService.setFromRenderer('autoLockMinutes', '99999', UNLOCKED)).toThrow();
    });
});
