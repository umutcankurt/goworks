import { app } from 'electron';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../db';
import { UserFacingError } from '../lib/errors';

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
    // OAuth client secret. Stored in plaintext alongside clientId: a desktop app
    // is a "public client" (RFC 8252) so this is not a true secret, and it is
    // needed BEFORE the vault is unlocked (to build the OAuth2 client that
    // refreshes the access token). The truly sensitive secrets (Service Account
    // key, refresh token) live encrypted in the master-password vault.
    | 'googleClientSecret'
    | 'termsAcceptedAt'
    | 'termsVersion'
    // Idle auto-lock timeout in minutes ('0' = disabled). Drives both the
    // main-process OS-idle timer and the renderer session timer.
    | 'autoLockMinutes';

export type AppLanguage = 'tr' | 'en';

export type OnboardingStep =
    | 'welcome'
    | 'terms'
    | 'branding'
    | 'cloud'
    | 'master-password'
    | 'service-account'
    | 'dwd'
    | 'admin-login';

export const ONBOARDING_STEPS: OnboardingStep[] = [
    'welcome',
    'terms',
    'branding',
    'cloud',
    // Master password must be set BEFORE the first vault write (the Service
    // Account step), so the vault is created + unlocked here and stays unlocked
    // for the remainder of the wizard.
    'master-password',
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
    googleClientSecret: string;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    autoLockMinutes: string;
}

/** Config shape exposed to the renderer — never includes the OAuth client secret. */
export type PublicAppConfig = Omit<AppConfig, 'googleClientSecret'>;

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
    googleClientSecret: '',
    termsAcceptedAt: null,
    termsVersion: null,
    autoLockMinutes: '60',
};

const ALLOWED_LOGO_EXTS = ['png', 'jpg', 'jpeg', 'svg', 'webp'] as const;
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

/** uploadLogo() is the only writer, and it always uses this exact shape. */
const LOGO_BASENAME_RE = /^logo\.(png|jpg|jpeg|svg|webp)$/;

/**
 * Keys the renderer may write through the generic `config:set` channel.
 *
 * This is an ALLOWLIST on purpose. `AppConfigKey` is a TypeScript union and is
 * erased at build time, so without an explicit runtime membership check the
 * renderer can write ANY key — including ones the main process later reads back
 * as a filesystem path or as a security boundary.
 *
 * Deliberately excluded:
 *   logoPath              written only by uploadLogo(). It is read back and then
 *                         opened (config:getLogoDataUrl) and unlinked
 *                         (deleteLogo), so a renderer-controlled value is an
 *                         arbitrary file read + delete primitive.
 *   googleClientId,
 *   googleClientSecret    have a dedicated, better-validated handler
 *                         (config:setOAuthCredentials).
 *   onboardingCompletedAt,
 *   termsAcceptedAt,
 *   termsVersion          set only by their own transactional helpers, which
 *                         enforce invariants the generic setter cannot.
 */
const RENDERER_WRITABLE_KEYS: readonly AppConfigKey[] = [
    'companyName',
    'sidebarAbbr',
    'emailSenderName',
    'language',
    'onboardingStep',
    'allowedDomain',
    'autoLockMinutes',
];

/**
 * Writable keys that define a security control rather than a cosmetic setting.
 *
 * They must stay writable during onboarding — the wizard sets `allowedDomain` at
 * the branding step, which runs before the vault exists — but once onboarding is
 * complete they require an unlocked vault. Otherwise a renderer foothold could
 * relocate the login tenant boundary, or disable the idle auto-lock, from the
 * lock screen itself.
 */
const VAULT_GATED_KEYS: readonly AppConfigKey[] = ['allowedDomain', 'autoLockMinutes'];

function isRendererWritable(key: string): key is AppConfigKey {
    return (RENDERER_WRITABLE_KEYS as readonly string[]).includes(key);
}

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
            throw new UserFacingError(`Geçersiz dil: ${trimmed}. Desteklenen değerler: tr, en`);
        }
        return v;
    }
    if (key === 'onboardingStep') {
        if (!ONBOARDING_STEPS.includes(trimmed as OnboardingStep)) {
            throw new UserFacingError(`Geçersiz onboarding adımı: ${trimmed}`);
        }
        return trimmed;
    }
    if (key === 'autoLockMinutes') {
        const n = parseInt(trimmed, 10);
        if (!Number.isFinite(n) || n < 0 || n > 1440) {
            throw new UserFacingError(`Geçersiz otomatik kilit süresi: ${trimmed}`);
        }
        return String(n);
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
                throw new UserFacingError('Geçersiz domain formatı (örn: example.com)');
            }
        }
        if (key === 'sidebarAbbr' && normalized && normalized.length > 5) {
            throw new UserFacingError('Sidebar kısaltması en fazla 5 karakter olabilir');
        }
        if (key === 'companyName' && normalized && normalized.length > 80) {
            throw new UserFacingError('Firma adı en fazla 80 karakter olabilir');
        }
        if (key === 'googleClientId' && normalized && normalized.length > 256) {
            throw new UserFacingError('Google Client ID en fazla 256 karakter olabilir');
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

    /**
     * Renderer-facing setter for the generic `config:set` channel.
     *
     * `set()` trusts its `key` because its TypeScript signature constrains it at
     * every internal call site. Nothing constrains a value arriving over IPC, so
     * the boundary needs its own check — see RENDERER_WRITABLE_KEYS.
     *
     * `vaultUnlocked` is passed in rather than read from vaultManager to keep
     * this module free of that dependency (vault-manager already reads config,
     * so importing it here would be circular) and to keep the rule unit-testable.
     */
    setFromRenderer(key: string, value: string | null, ctx: { vaultUnlocked: boolean }): void {
        if (!isRendererWritable(key)) {
            throw new UserFacingError(`Bu ayar bu kanaldan değiştirilemez: ${key}`);
        }
        if (
            (VAULT_GATED_KEYS as readonly string[]).includes(key)
            && this.get('onboardingCompletedAt')
            && !ctx.vaultUnlocked
        ) {
            throw new UserFacingError(
                'Bu ayarı değiştirmek için önce ana parola ile kilidi açmalısınız.',
            );
        }
        this.set(key, value);
    },

    /**
     * Public config snapshot for the renderer. Deliberately OMITS
     * `googleClientSecret` — the renderer only ever learns whether a secret
     * exists (via `config:getOAuthCredentials` → `hasSecret`), never its value.
     */
    getAll(): PublicAppConfig {
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
            autoLockMinutes: this.get('autoLockMinutes'),
        };
    },

    /** Auto-lock idle timeout in minutes (0 = disabled). Clamped to a sane range. */
    getAutoLockMinutes(): number {
        const raw = parseInt(this.get('autoLockMinutes') || '60', 10);
        if (!Number.isFinite(raw) || raw < 0) return 60;
        return Math.min(raw, 1440);
    },

    /**
     * Finish onboarding: companyName + allowedDomain must be filled.
     * `onboardingCompletedAt` is set, `onboardingStep` is cleared.
     */
    markOnboardingComplete(): PublicAppConfig {
        const company = this.get('companyName');
        const domain = this.get('allowedDomain');
        const clientId = this.get('googleClientId');
        if (!company || !domain) {
            throw new UserFacingError(
                'Onboarding tamamlanmadan önce firma adı ve izin verilen domain doldurulmalı.',
            );
        }
        if (!clientId) {
            throw new UserFacingError(
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
    acceptTerms(version: string): PublicAppConfig {
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
    resetOnboarding(): PublicAppConfig {
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
            throw new UserFacingError(`İzin verilmeyen dosya formatı: ${cleanExt}. İzin verilenler: ${ALLOWED_LOGO_EXTS.join(', ')}`);
        }
        if (buffer.byteLength > MAX_LOGO_BYTES) {
            throw new UserFacingError(`Logo dosyası çok büyük (max ${MAX_LOGO_BYTES / 1024} KB)`);
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

    /**
     * The stored logoPath, but only if it still denotes a real logo file.
     *
     * Defence in depth behind the config:set allowlist. That allowlist stops a
     * renderer WRITING this row, but a row planted by an older build survives an
     * upgrade — and the two consumers of this value open it and unlink it. So
     * the value is re-validated at the point of use: it must resolve inside the
     * branding directory AND have a `logo.<allowed-ext>` basename. Anything else
     * is treated as absent rather than trusted.
     */
    resolveLogoPath(): string | null {
        const stored = this.get('logoPath');
        if (!stored) return null;
        const dir = getBrandingDir();
        // Accept a bare filename or an absolute path; normalise both, then
        // require containment. path.resolve collapses any `..` first.
        const resolved = path.resolve(dir, stored);
        if (path.dirname(resolved) !== path.resolve(dir)) return null;
        if (!LOGO_BASENAME_RE.test(path.basename(resolved))) return null;
        return resolved;
    },

    deleteLogo(): void {
        const current = this.resolveLogoPath();
        if (current && existsSync(current)) {
            try { unlinkSync(current); } catch { /* ignore */ }
        }
        // Completely remove the key from app_config
        getDb().prepare('DELETE FROM app_config WHERE key = ?').run('logoPath');
    },

    logoExists(): boolean {
        const p = this.resolveLogoPath();
        if (!p) return false;
        try {
            return statSync(p).isFile();
        } catch {
            return false;
        }
    },
};
