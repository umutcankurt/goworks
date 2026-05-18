/**
 * OS keychain (Electron safeStorage) üzerinden OAuth secret saklayan ince wrapper.
 *
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: kwallet / gnome-libsecret (headless ortamlarda
 *   `isEncryptionAvailable()` false döner; set sırasında net hata fırlatılır).
 *
 * Dosya yolu: `userData/secrets/oauth-secret.enc` (binary, safeStorage çıktısı).
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

const FILE_NAME = 'oauth-secret.enc';

function getSecretsDir(): string {
    const dir = path.join(app.getPath('userData'), 'secrets');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getSecretFilePath(): string {
    return path.join(getSecretsDir(), FILE_NAME);
}

export const secureStorage = {
    /**
     * Plain-text secret'ı safeStorage ile şifreleyip dosyaya yazar.
     * `safeStorage.isEncryptionAvailable() === false` ise hata fırlatır.
     */
    setClientSecret(secret: string): void {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error(
                'OS keychain şifrelemesi kullanılabilir değil. ' +
                'macOS Keychain, Windows DPAPI veya Linux libsecret/kwallet gerekli.',
            );
        }
        const trimmed = secret.trim();
        if (!trimmed) {
            throw new Error('Boş client secret kaydedilemez');
        }
        const encrypted = safeStorage.encryptString(trimmed);
        writeFileSync(getSecretFilePath(), encrypted);
    },

    getClientSecret(): string | null {
        const filePath = getSecretFilePath();
        if (!existsSync(filePath)) return null;
        if (!safeStorage.isEncryptionAvailable()) {
            // Dosya var ama decrypt edilemiyor — açıkça null dönmek yerine
            // sessizce başarısız olmamak için hata at; çağıran karar versin.
            throw new Error(
                'OAuth client secret dosyası mevcut ancak OS keychain şifrelemesi kullanılabilir değil.',
            );
        }
        const buf = readFileSync(filePath);
        return safeStorage.decryptString(buf);
    },

    hasClientSecret(): boolean {
        return existsSync(getSecretFilePath());
    },

    clearClientSecret(): void {
        const filePath = getSecretFilePath();
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
    },
};
