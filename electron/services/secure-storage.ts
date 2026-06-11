/**
 * A thin wrapper that stores sensitive credentials encrypted via the
 * OS keychain (Electron safeStorage).
 *
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: kwallet / gnome-libsecret (in headless environments
 *   `isEncryptionAvailable()` returns false; a clear error is thrown on set).
 *
 * Stored files (all in `userData/secrets/`, binary safeStorage output):
 * - `oauth-secret.enc`     — OAuth client secret
 * - `service-account.enc`  — Service Account JSON (DWD private key)
 * - `auth-token.enc`       — OAuth access/refresh tokens
 *
 * NOTE: safeStorage APIs are only valid after `app.whenReady()` — no function
 * in this module should be called at module level (at import time).
 */
import { app, safeStorage } from 'electron';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';

const OAUTH_SECRET_FILE = 'oauth-secret.enc';
const SERVICE_ACCOUNT_FILE = 'service-account.enc';
const AUTH_TOKEN_FILE = 'auth-token.enc';

function getSecretsDir(): string {
    const dir = path.join(app.getPath('userData'), 'secrets');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
}

function getFilePath(fileName: string): string {
    return path.join(getSecretsDir(), fileName);
}

/**
 * Encrypts plaintext via safeStorage and writes it to the `secrets/<fileName>` file.
 * Throws if `safeStorage.isEncryptionAvailable() === false`.
 */
function encryptToFile(fileName: string, plaintext: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain şifrelemesi kullanılabilir değil. ' +
            'macOS Keychain, Windows DPAPI veya Linux libsecret/kwallet gerekli.',
        );
    }
    const trimmed = plaintext.trim();
    if (!trimmed) {
        throw new Error('Boş içerik şifreli olarak kaydedilemez');
    }
    writeFileSync(getFilePath(fileName), safeStorage.encryptString(trimmed));
}

/**
 * Reads and decrypts the `secrets/<fileName>` file. Returns `null` if the file
 * doesn't exist; if the file exists but encryption is unavailable, throws (so the
 * caller decides, instead of silently returning null).
 */
function decryptFromFile(fileName: string): string | null {
    const filePath = getFilePath(fileName);
    if (!existsSync(filePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            `Şifreli dosya mevcut (${fileName}) ancak OS keychain şifrelemesi ` +
            'kullanılabilir değil.',
        );
    }
    return safeStorage.decryptString(readFileSync(filePath));
}

function fileExists(fileName: string): boolean {
    return existsSync(getFilePath(fileName));
}

function deleteFile(fileName: string): void {
    const filePath = getFilePath(fileName);
    if (existsSync(filePath)) {
        unlinkSync(filePath);
    }
}

/**
 * OAuth client secret store (Phase 31). The public API is preserved — `auth-service.ts`
 * and `boot-check.ts` call these method names.
 */
export const secureStorage = {
    /**
     * Encrypts the plain-text secret via safeStorage and writes it to a file.
     * Throws if `safeStorage.isEncryptionAvailable() === false`.
     */
    setClientSecret(secret: string): void {
        encryptToFile(OAUTH_SECRET_FILE, secret);
    },
    getClientSecret(): string | null {
        return decryptFromFile(OAUTH_SECRET_FILE);
    },
    hasClientSecret(): boolean {
        return fileExists(OAUTH_SECRET_FILE);
    },
    clearClientSecret(): void {
        deleteFile(OAUTH_SECRET_FILE);
    },
};

/**
 * Service Account JSON store — contains the DWD private key, stored encrypted.
 * `set` takes the raw JSON text; validation/parsing is done in
 * `service-account-loader.ts`.
 */
export const serviceAccountStore = {
    set(json: string): void {
        encryptToFile(SERVICE_ACCOUNT_FILE, json);
    },
    get(): string | null {
        return decryptFromFile(SERVICE_ACCOUNT_FILE);
    },
    has(): boolean {
        return fileExists(SERVICE_ACCOUNT_FILE);
    },
    clear(): void {
        deleteFile(SERVICE_ACCOUNT_FILE);
    },
};

/**
 * OAuth access/refresh token store — stored encrypted for the session.
 * `set` takes the `JSON.stringify(tokens)` text.
 */
export const authTokenStore = {
    set(json: string): void {
        encryptToFile(AUTH_TOKEN_FILE, json);
    },
    get(): string | null {
        return decryptFromFile(AUTH_TOKEN_FILE);
    },
    has(): boolean {
        return fileExists(AUTH_TOKEN_FILE);
    },
    clear(): void {
        deleteFile(AUTH_TOKEN_FILE);
    },
};
