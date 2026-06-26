/**
 * Vault manager — main-process coordinator around the pure `vault-service`.
 *
 * Owns the single source of truth for the session lock state and holds the
 * unlocked `Vault` (and therefore the DEK) in main-process memory only. The DEK
 * and decrypted secrets are NEVER sent to the renderer; the renderer calls
 * `vault:unlock(password)` and receives only a status snapshot.
 *
 * Session state machine (see the approved plan):
 *   NEEDS_ONBOARDING  — no vault file, onboarding not finished → run the wizard
 *   NEEDS_VAULT_SETUP — no vault file but onboarding WAS finished (legacy upgrade
 *                       or post-reset) → focused "set a master password" screen
 *   LOCKED            — vault file exists, DEK not in memory → lock screen
 *   UNLOCKED          — DEK in memory, app usable
 *
 * Graceful Lock: `requestLock()` soft-locks the UI immediately (dispatch-gate
 * closes, renderer shows the lock screen) but keeps the DEK + OAuth credentials
 * alive while jobs are RUNNING. The DEK is zeroized only once the last running
 * job settles (`onJobSettled()`), so a bulk job started before the user walked
 * away still completes.
 *
 * Dependencies are injected via `setHooks()` (the runner / auth-service / window)
 * to avoid import cycles — this module is imported BY service-account-loader and
 * auth-service, so it must not import them back.
 */
import { app } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
    Vault,
    readVaultFile,
    writeVaultFileAtomic,
    deleteVaultFile,
    VaultLockedError,
    WrongPasswordError,
} from './vault-service';
import { logger } from './logger';
import { appConfigService } from './app-config-service';
import { secureStorage, serviceAccountStore, authTokenStore } from './secure-storage';

/**
 * Thrown by `unlock()` while the vault is in a brute-force back-off window. The
 * Argon2id KDF already makes each guess expensive; this adds a temporary lockout
 * after repeated wrong passwords (defense in depth for a stolen `vault.enc`).
 */
export class TooManyAttemptsError extends Error {
    constructor(public readonly retryAfterMs: number) {
        super(`Çok fazla hatalı deneme. ${Math.ceil(retryAfterMs / 1000)} sn sonra tekrar deneyin.`);
        this.name = 'TooManyAttemptsError';
    }
}

export type VaultStatus =
    | 'NEEDS_ONBOARDING'
    | 'NEEDS_VAULT_SETUP'
    | 'LOCKED'
    | 'UNLOCKED';

export interface VaultStateSnapshot {
    status: VaultStatus;
    /** True while a soft-lock is waiting for running jobs before zeroizing the DEK. */
    hardLockPending: boolean;
    /** True when the vault is unlocked but the Google refresh token is invalid. */
    googleReauthNeeded: boolean;
    /** Number of PENDING jobs queued — shown on the lock screen ("N waiting"). */
    pendingJobs: number;
    /** True if a vault file exists but is unreadable (offer "reset vault"). */
    corrupt: boolean;
    /** Epoch ms until which unlock is blocked after too many wrong passwords (0 = not locked out). */
    lockedUntil: number;
}

export interface VaultHooks {
    /** Jobs currently RUNNING in the in-process runner. */
    getRunningCount: () => number;
    /** Jobs currently PENDING in the queue (for the lock-screen counter). */
    getPendingCount: () => number;
    /** Drop the in-memory OAuth credentials WITHOUT revoking (lock, not logout). */
    dropAuthCredentials: () => void;
    /** Clear cached GoogleAuth clients that hold the Service Account key. */
    clearSecretCaches: () => void;
    /** Resume the dispatcher + restore the Google session after a successful unlock. */
    onUnlocked: () => void | Promise<void>;
    /** Send an IPC event to the renderer (e.g. 'vault:locked'). */
    notify: (channel: string) => void;
}

/** Start backing off after this many consecutive wrong passwords. */
const LOCKOUT_THRESHOLD = 5;
/** First back-off after the threshold; doubles per extra failure. */
const LOCKOUT_BASE_MS = 15_000;
/** Cap on the back-off window. */
const LOCKOUT_MAX_MS = 5 * 60_000;

class VaultManager {
    private vault: Vault | null = null;
    private status: VaultStatus = 'NEEDS_ONBOARDING';
    private hardLockPending = false;
    private googleReauthNeeded = false;
    private corrupt = false;
    private failedAttempts = 0;
    private lockedUntil = 0;
    private hooks: Partial<VaultHooks> = {};

    setHooks(hooks: VaultHooks): void {
        this.hooks = hooks;
    }

    private filePath(): string {
        return path.join(app.getPath('userData'), 'vault.enc');
    }

    fileExists(): boolean {
        return existsSync(this.filePath());
    }

    /**
     * Boot-time init. Loads the vault file (locked) or decides which setup flow
     * the renderer should show. Never derives a key here (no password yet).
     */
    init(): void {
        this.corrupt = false;
        const bytes = readVaultFile(this.filePath());
        if (bytes) {
            try {
                this.vault = Vault.fromBytes(bytes);
                this.status = 'LOCKED';
            } catch (e) {
                logger.error('[vault] vault.enc bozuk veya okunamıyor:', e);
                this.vault = null;
                this.status = 'LOCKED';
                this.corrupt = true;
            }
            return;
        }
        // No vault file. Fresh install → full onboarding; already-onboarded (legacy
        // upgrade or post-reset) → focused master-password setup.
        this.vault = null;
        const onboarded = !!appConfigService.get('onboardingCompletedAt');
        this.status = onboarded ? 'NEEDS_VAULT_SETUP' : 'NEEDS_ONBOARDING';
    }

    getState(): VaultStateSnapshot {
        return {
            status: this.status,
            hardLockPending: this.hardLockPending,
            googleReauthNeeded: this.googleReauthNeeded,
            pendingJobs: (() => { try { return this.hooks.getPendingCount?.() ?? 0; } catch { return 0; } })(),
            corrupt: this.corrupt,
            lockedUntil: this.lockedUntil,
        };
    }

    /** Register a wrong password and, past the threshold, arm an exponential back-off. */
    private registerFailedAttempt(): void {
        this.failedAttempts += 1;
        if (this.failedAttempts >= LOCKOUT_THRESHOLD) {
            const over = this.failedAttempts - LOCKOUT_THRESHOLD;
            const wait = Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** over);
            this.lockedUntil = Date.now() + wait;
            logger.warn(`[vault] ${this.failedAttempts} hatalı deneme — ${Math.ceil(wait / 1000)} sn kilitlendi.`);
        }
    }

    /** Dispatch-gate: PENDING jobs are only dispatched when fully unlocked. */
    isLocked(): boolean {
        return this.status !== 'UNLOCKED';
    }

    isUnlocked(): boolean {
        return this.status === 'UNLOCKED';
    }

    /**
     * Create a brand-new vault protected by `password`, absorbing any legacy
     * safeStorage secrets (`service-account.enc`, refresh token from
     * `auth-token.enc`, client secret → app_config) so existing installs migrate
     * transparently. Two-phase commit: the vault is written + verified BEFORE the
     * legacy `.enc` files are deleted, so an interrupted migration never loses data.
     *
     * Used by both the onboarding master-password step (fresh, nothing to absorb)
     * and the legacy upgrade screen.
     */
    async create(password: string): Promise<VaultStateSnapshot> {
        if (!password || password.length < 1) {
            throw new Error('Ana parola boş olamaz.');
        }
        const v = Vault.create(password);

        // --- Absorb legacy secrets (idempotent; no-ops on a fresh install) ---
        let absorbedClientSecret: string | null = null;
        try {
            const saRaw = serviceAccountStore.get();
            if (saRaw) v.setField('serviceAccount', saRaw);
        } catch (e) {
            logger.warn('[vault] legacy service-account.enc okunamadı (migration atlandı):', e);
        }
        try {
            const tokRaw = authTokenStore.get();
            if (tokRaw) {
                const refresh = (JSON.parse(tokRaw) as { refresh_token?: string })?.refresh_token;
                if (refresh) v.setField('refreshToken', refresh);
            }
        } catch (e) {
            logger.warn('[vault] legacy auth-token.enc okunamadı (migration atlandı):', e);
        }
        try {
            absorbedClientSecret = secureStorage.getClientSecret();
        } catch (e) {
            logger.warn('[vault] legacy oauth-secret.enc okunamadı:', e);
        }

        // --- Phase 1: write the vault, then re-open + unlock to verify it ---
        const filePath = this.filePath();
        writeVaultFileAtomic(filePath, v.serialize());
        const verifyBytes = readVaultFile(filePath);
        if (!verifyBytes) throw new Error('Vault yazıldı ama geri okunamadı.');
        Vault.fromBytes(verifyBytes).unlock(password); // throws if the write is bad

        // Client secret moves to plaintext app_config (RFC 8252 public client).
        if (absorbedClientSecret && !appConfigService.get('googleClientSecret')) {
            try { appConfigService.set('googleClientSecret', absorbedClientSecret); } catch (e) {
                logger.warn('[vault] client secret app_config\'e taşınamadı:', e);
            }
        }

        // --- Phase 2: only now delete the legacy .enc files (vault verified) ---
        try { serviceAccountStore.clear(); } catch { /* ignore */ }
        try { authTokenStore.clear(); } catch { /* ignore */ }
        try { secureStorage.clearClientSecret(); } catch { /* ignore */ }

        this.vault = v;
        this.status = 'UNLOCKED';
        this.hardLockPending = false;
        this.googleReauthNeeded = false;
        this.corrupt = false;
        logger.info('[vault] Vault oluşturuldu ve kilidi açıldı (legacy migration dahil).');
        // Entering UNLOCKED — run the same post-unlock restore as unlock() so a
        // legacy migration immediately re-establishes the Google session.
        try {
            await this.hooks.onUnlocked?.();
        } catch (e) {
            logger.warn('[vault] onUnlocked hook hatası (create):', e);
        }
        return this.getState();
    }

    /**
     * Unlock the vault with the master password. Throws `WrongPasswordError` /
     * `VaultCorruptError`. If a hard-lock is pending (DEK still alive for running
     * jobs), this re-verifies the password and cancels the pending lock — the live
     * DEK is preserved on a wrong password (see `Vault.unlock`).
     */
    async unlock(password: string): Promise<VaultStateSnapshot> {
        if (this.status === 'NEEDS_ONBOARDING' || this.status === 'NEEDS_VAULT_SETUP') {
            throw new Error('Henüz bir vault yok — önce ana parola belirleyin.');
        }
        const now = Date.now();
        if (this.lockedUntil > now) {
            throw new TooManyAttemptsError(this.lockedUntil - now);
        }
        if (!this.vault) {
            const bytes = readVaultFile(this.filePath());
            if (!bytes) throw new Error('Vault dosyası bulunamadı.');
            this.vault = Vault.fromBytes(bytes); // throws VaultCorruptError
            this.corrupt = false;
        }
        try {
            this.vault.unlock(password); // throws on wrong password; live DEK untouched
        } catch (e) {
            if (e instanceof WrongPasswordError) this.registerFailedAttempt();
            throw e;
        }
        // Success — clear the brute-force counter.
        this.failedAttempts = 0;
        this.lockedUntil = 0;
        this.status = 'UNLOCKED';
        this.hardLockPending = false;
        try {
            await this.hooks.onUnlocked?.();
        } catch (e) {
            logger.warn('[vault] onUnlocked hook hatası:', e);
        }
        return this.getState();
    }

    /**
     * Soft-lock now (idle / manual). The UI locks immediately; the DEK is kept
     * while jobs are RUNNING and zeroized once they drain (Graceful Lock).
     */
    requestLock(): void {
        if (this.status !== 'UNLOCKED') return;
        this.status = 'LOCKED';
        logger.info('[vault] Soft lock — UI kilitlendi.');
        try { this.hooks.notify?.('vault:locked'); } catch { /* ignore */ }
        this.tryFinalizeLock();
    }

    private tryFinalizeLock(): void {
        const running = (() => { try { return this.hooks.getRunningCount?.() ?? 0; } catch { return 0; } })();
        if (running > 0) {
            this.hardLockPending = true;
            logger.info(`[vault] Hard lock bekliyor — ${running} iş tamamlanıyor.`);
            return;
        }
        this.finalizeLock();
    }

    /** Called by the runner after every job settles. */
    onJobSettled(): void {
        if (!this.hardLockPending) return;
        const running = (() => { try { return this.hooks.getRunningCount?.() ?? 0; } catch { return 0; } })();
        if (running === 0) this.finalizeLock();
    }

    private finalizeLock(): void {
        this.hardLockPending = false;
        try { this.vault?.lock(); } catch { /* ignore */ }
        try { this.hooks.dropAuthCredentials?.(); } catch { /* ignore */ }
        try { this.hooks.clearSecretCaches?.(); } catch { /* ignore */ }
        logger.info('[vault] Hard lock tamam — DEK ve oturum anahtarları sıfırlandı.');
    }

    setGoogleReauthNeeded(needed: boolean): void {
        this.googleReauthNeeded = needed;
    }

    /**
     * Whether the last silent session restore (after an unlock) failed and a full
     * Google re-login is required. Used by the IPC auth guard so admin/group calls
     * fail with a clear "session expired" message instead of a cryptic
     * google-auth-library error from an empty OAuth client.
     */
    getGoogleReauthNeeded(): boolean {
        return this.googleReauthNeeded;
    }

    // --- Secret accessors (gated on the LIVE DEK so running jobs work during a
    //     pending hard-lock; throw once the DEK is actually zeroized). ---

    getServiceAccount(): string | null {
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        return this.vault.getField('serviceAccount');
    }

    setServiceAccount(json: string): void {
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        this.vault.setField('serviceAccount', json);
        this.persist();
    }

    clearServiceAccount(): void {
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        this.vault.setField('serviceAccount', null);
        this.persist();
    }

    getRefreshToken(): string | null {
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        return this.vault.getField('refreshToken');
    }

    setRefreshToken(token: string | null): void {
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        this.vault.setField('refreshToken', token);
        this.persist();
    }

    /**
     * Change the master password in place (Settings → Security). The vault must be
     * UNLOCKED. Re-wraps the DEK under the new password and persists atomically; the
     * encrypted payload (Service Account + refresh token) is preserved, so the
     * Google session and DWD keep working without any re-upload or re-login.
     */
    changePassword(current: string, next: string): void {
        if (!next || next.length < 1) throw new Error('Yeni parola boş olamaz.');
        if (!this.vault?.isUnlocked()) throw new VaultLockedError();
        this.vault.changePassword(current, next); // throws WrongPasswordError on bad current
        this.persist();
        logger.info('[vault] Ana parola değiştirildi (DEK re-wrap, payload korundu).');
    }

    private persist(): void {
        if (!this.vault) return;
        writeVaultFileAtomic(this.filePath(), this.vault.serialize());
    }

    /**
     * "Forgot password" / unrecoverable vault: delete vault.enc and restart the
     * wizard so the user sets a new master password, re-uploads the Service
     * Account and signs in again. Branding/clientId/clientSecret in app_config are
     * preserved (resetOnboarding only rewinds the wizard step pointer).
     */
    /**
     * Factory-reset helper: zeroize keys and delete vault.enc without touching
     * app_config (the caller wipes the whole DB). Safe whether locked or unlocked.
     */
    wipe(): void {
        try { this.vault?.lock(); } catch { /* ignore */ }
        this.vault = null;
        deleteVaultFile(this.filePath());
        this.status = 'NEEDS_ONBOARDING';
        this.hardLockPending = false;
        this.googleReauthNeeded = false;
        this.corrupt = false;
        this.failedAttempts = 0;
        this.lockedUntil = 0;
    }

    resetVault(): VaultStateSnapshot {
        try { this.vault?.lock(); } catch { /* ignore */ }
        this.vault = null;
        deleteVaultFile(this.filePath());
        try { this.hooks.dropAuthCredentials?.(); } catch { /* ignore */ }
        try { this.hooks.clearSecretCaches?.(); } catch { /* ignore */ }
        try { appConfigService.resetOnboarding(); } catch { /* ignore */ }
        this.status = 'NEEDS_ONBOARDING';
        this.hardLockPending = false;
        this.googleReauthNeeded = false;
        this.corrupt = false;
        this.failedAttempts = 0;
        this.lockedUntil = 0;
        logger.warn('[vault] Vault sıfırlandı — yeniden kurulum gerekiyor.');
        return this.getState();
    }
}

export const vaultManager = new VaultManager();
