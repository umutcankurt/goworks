/**
 * OS keychain (Electron safeStorage) üzerinden hassas kimlik bilgilerini
 * şifreli saklayan ince wrapper.
 *
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: kwallet / gnome-libsecret (headless ortamlarda
 *   `isEncryptionAvailable()` false döner; set sırasında net hata fırlatılır).
 *
 * Saklanan dosyalar (hepsi `userData/secrets/`, binary safeStorage çıktısı):
 * - `oauth-secret.enc`     — OAuth client secret
 * - `service-account.enc`  — Service Account JSON (DWD private key)
 * - `auth-token.enc`       — OAuth erişim/refresh token'ları
 *
 * NOT: safeStorage API'leri yalnız `app.whenReady()` sonrası geçerli — bu
 * modüldeki hiçbir fonksiyon modül seviyesinde (import anında) çağrılmamalı.
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
 * Düz metni safeStorage ile şifreleyip `secrets/<fileName>` dosyasına yazar.
 * `safeStorage.isEncryptionAvailable() === false` ise hata fırlatır.
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
 * `secrets/<fileName>` dosyasını okuyup decrypt eder. Dosya yoksa `null` döner;
 * dosya var ama şifreleme kullanılamıyorsa hata fırlatır (sessizce null dönmek
 * yerine çağıran karar versin).
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
 * OAuth client secret deposu (Faz 31). Public API korunur — `auth-service.ts`
 * ve `boot-check.ts` bu metot adlarını çağırıyor.
 */
export const secureStorage = {
    /**
     * Plain-text secret'ı safeStorage ile şifreleyip dosyaya yazar.
     * `safeStorage.isEncryptionAvailable() === false` ise hata fırlatır.
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
 * Service Account JSON deposu — DWD private key içerir, şifreli saklanır.
 * `set` ham JSON metnini alır; doğrulama/parse `service-account-loader.ts`'te
 * yapılır.
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
 * OAuth erişim/refresh token deposu — oturum boyunca şifreli saklanır.
 * `set` `JSON.stringify(tokens)` metnini alır.
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
