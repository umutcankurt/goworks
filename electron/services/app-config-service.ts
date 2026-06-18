import { app } from 'electron';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../db';

export type AppConfigKey =
    | 'companyName'
    | 'sidebarAbbr'
    | 'logoPath'
    | 'emailSenderName'
    | 'allowedDomain'
    | 'language'
    | 'onboardingStep'
    | 'onboardingCompletedAt'
    | 'googleClientId'
    | 'termsAcceptedAt'
    | 'termsVersion';

export type AppLanguage = 'tr' | 'en';

export type OnboardingStep =
    | 'welcome'
    | 'terms'
    | 'branding'
    | 'cloud'
    | 'service-account'
    | 'dwd'
    | 'admin-login';

export const ONBOARDING_STEPS: OnboardingStep[] = [
    'welcome',
    'terms',
    'branding',
    'cloud',
    'service-account',
    'dwd',
    'admin-login',
];

export interface AppConfig {
    companyName: string;
    sidebarAbbr: string | null;
    logoPath: string | null;
    emailSenderName: string;
    allowedDomain: string;
    language: AppLanguage;
    onboardingStep: OnboardingStep | null;
    onboardingCompletedAt: string | null;
    googleClientId: string;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
}

/**
 * Default values are for the initial setup. Until onboarding is complete
 * (`onboardingCompletedAt` null) the renderer is forced to `/onboarding`.
 */
const DEFAULTS: AppConfig = {
    companyName: '',
    sidebarAbbr: null,
    logoPath: null,
    emailSenderName: 'GoWorks',
    allowedDomain: '',
    language: 'tr',
    onboardingStep: null,
    onboardingCompletedAt: null,
    googleClientId: '',
    termsAcceptedAt: null,
    termsVersion: null,
};

const ALLOWED_LOGO_EXTS = ['png', 'jpg', 'jpeg', 'svg', 'webp'] as const;
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

function getBrandingDir(): string {
    const dir = path.join(app.getPath('userData'), 'branding');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function nowIso(): string {
    return new Date().toISOString();
}

function normalizeValue(key: AppConfigKey, raw: string | null): string | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (key === 'allowedDomain') return trimmed.toLowerCase();
    if (key === 'language') {
        const v = trimmed.toLowerCase();
        if (v !== 'tr' && v !== 'en') {
            throw new Error(`Geçersiz dil: ${trimmed}. Desteklenen değerler: tr, en`);
        }
        return v;
    }
    if (key === 'onboardingStep') {
        if (!ONBOARDING_STEPS.includes(trimmed as OnboardingStep)) {
            throw new Error(`Geçersiz onboarding adımı: ${trimmed}`);
        }
        return trimmed;
    }
    return trimmed;
}

function readRow(key: AppConfigKey): string | null {
    const row = getDb()
        .prepare('SELECT value FROM app_config WHERE key = ?')
        .get(key) as { value: string | null } | undefined;
    return row?.value ?? null;
}

export const appConfigService = {
    get<K extends AppConfigKey>(key: K): AppConfig[K] {
        const stored = readRow(key);
        if (stored !== null) return stored as AppConfig[K];
        return DEFAULTS[key];
    },

    set<K extends AppConfigKey>(key: K, value: string | null): void {
        const normalized = normalizeValue(key, value);
        // companyName may be left empty (initial setup / onboarding scenario).
        // Once the onboarding screen is added, a requirement can be enforced here.
        if (key === 'allowedDomain' && normalized) {
            // Leaving it empty is allowed; but if filled, the format must be valid.
            if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
                throw new Error('Geçersiz domain formatı (örn: example.com)');
            }
        }
        if (key === 'sidebarAbbr' && normalized && normalized.length > 5) {
            throw new Error('Sidebar kısaltması en fazla 5 karakter olabilir');
        }
        if (key === 'companyName' && normalized && normalized.length > 80) {
            throw new Error('Firma adı en fazla 80 karakter olabilir');
        }
        if (key === 'googleClientId' && normalized && normalized.length > 256) {
            throw new Error('Google Client ID en fazla 256 karakter olabilir');
        }

        if (normalized === null) {
            getDb().prepare('DELETE FROM app_config WHERE key = ?').run(key);
        } else {
            getDb()
                .prepare(
                    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
                )
                .run(key, normalized, nowIso());
        }
    },

    getAll(): AppConfig {
        return {
            companyName: this.get('companyName'),
            sidebarAbbr: this.get('sidebarAbbr'),
            logoPath: this.get('logoPath'),
            emailSenderName: this.get('emailSenderName'),
            allowedDomain: this.get('allowedDomain'),
            language: this.get('language'),
            onboardingStep: this.get('onboardingStep'),
            onboardingCompletedAt: this.get('onboardingCompletedAt'),
            googleClientId: this.get('googleClientId'),
            termsAcceptedAt: this.get('termsAcceptedAt'),
            termsVersion: this.get('termsVersion'),
        };
    },

    /**
     * Finish onboarding: companyName + allowedDomain must be filled.
     * `onboardingCompletedAt` is set, `onboardingStep` is cleared.
     */
    markOnboardingComplete(): AppConfig {
        const company = this.get('companyName');
        const domain = this.get('allowedDomain');
        const clientId = this.get('googleClientId');
        if (!company || !domain) {
            throw new Error(
                'Onboarding tamamlanmadan önce firma adı ve izin verilen domain doldurulmalı.',
            );
        }
        if (!clientId) {
            throw new Error(
                'Onboarding tamamlanmadan önce Google OAuth Client ID kaydedilmiş olmalı.',
            );
        }
        const now = nowIso();
        const db = getDb();
        const upsert = db.prepare(
            `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        );
        const tx = db.transaction(() => {
            upsert.run('onboardingCompletedAt', now, now);
            db.prepare('DELETE FROM app_config WHERE key = ?').run('onboardingStep');
        });
        tx();
        return this.getAll();
    },

    /**
     * Record acceptance of the legal terms / disclaimer. Stores the accepted
     * version (for re-prompting when terms change) and a timestamp.
     */
    acceptTerms(version: string): AppConfig {
        const clean = (version ?? '').trim();
        if (!clean) {
            throw new Error('Terms version is required.');
        }
        const now = nowIso();
        const db = getDb();
        const upsert = db.prepare(
            `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        );
        const tx = db.transaction(() => {
            upsert.run('termsAcceptedAt', now, now);
            upsert.run('termsVersion', clean, now);
        });
        tx();
        return this.getAll();
    },

    /** Restart the wizard: completedAt null, step set to welcome. */
    resetOnboarding(): AppConfig {
        const db = getDb();
        const tx = db.transaction(() => {
            db.prepare('DELETE FROM app_config WHERE key = ?').run('onboardingCompletedAt');
            db.prepare(
                `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            ).run('onboardingStep', 'welcome', nowIso());
        });
        tx();
        return this.getAll();
    },

    uploadLogo(buffer: Buffer | Uint8Array, ext: string): string {
        const cleanExt = ext.toLowerCase().replace(/^\./, '');
        if (!ALLOWED_LOGO_EXTS.includes(cleanExt as (typeof ALLOWED_LOGO_EXTS)[number])) {
            throw new Error(`İzin verilmeyen dosya formatı: ${cleanExt}. İzin verilenler: ${ALLOWED_LOGO_EXTS.join(', ')}`);
        }
        if (buffer.byteLength > MAX_LOGO_BYTES) {
            throw new Error(`Logo dosyası çok büyük (max ${MAX_LOGO_BYTES / 1024} KB)`);
        }
        // Clean up old logo files (so old uploads with a different extension don't remain)
        const dir = getBrandingDir();
        for (const file of readdirSync(dir)) {
            if (file.startsWith('logo.')) {
                try { unlinkSync(path.join(dir, file)); } catch { /* ignore */ }
            }
        }
        const dest = path.join(dir, `logo.${cleanExt}`);
        writeFileSync(dest, buffer);
        this.set('logoPath', dest);
        return dest;
    },

    deleteLogo(): void {
        const current = this.get('logoPath');
        if (current && existsSync(current)) {
            try { unlinkSync(current); } catch { /* ignore */ }
        }
        // Completely remove the key from app_config
        getDb().prepare('DELETE FROM app_config WHERE key = ?').run('logoPath');
    },

    logoExists(): boolean {
        const p = this.get('logoPath');
        if (!p) return false;
        try {
            return statSync(p).isFile();
        } catch {
            return false;
        }
    },
};
