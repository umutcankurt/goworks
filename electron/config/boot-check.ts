/**
 * GoWorks boot-time config validation.
 *
 * `app.whenReady()` sonrası ÇOK ERKEN çağrılır — uygulamanın açılması için
 * mutlak gerekli olan kontroller burada yapılır. Iki seviye:
 *
 * 1. Hard-fail: `dialog.showErrorBox` + `app.exit(1)`. Eksiklik:
 *    - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (env veya inline'lanmış değer
 *      eksik / placeholder)
 *    - userData klasörü yazılabilir değil
 *
 * 2. Soft-warn: logger.warn + return flag. Eksiklik:
 *    - service-account.json yok ya da parse edilemez (DWD özellikleri
 *      devre dışı, geri kalan çalışır)
 *
 * Dev override: `GOWORKS_SKIP_BOOT_CHECK=1` env değişkeni ile tüm kontroller
 * atlanır. README'de belgelenmeli.
 */
import { app, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../services/logger';

const PLACEHOLDER_VALUES = new Set([
    '',
    'YOUR_CLIENT_ID',
    'YOUR_CLIENT_SECRET',
    'your_client_id_here',
    'your_client_secret_here',
]);

function isPlaceholder(v: string | undefined | null): boolean {
    if (!v) return true;
    return PLACEHOLDER_VALUES.has(v.trim());
}

interface FailureDetail {
    title: string;
    message: string;
    detail: string;
}

function validateOAuthCredentials(): FailureDetail | null {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (isPlaceholder(clientId) || isPlaceholder(clientSecret)) {
        return {
            title: 'OAuth Yapılandırması Eksik',
            message: 'GoWorks başlatılamadı: Google OAuth bilgileri ayarlanmamış.',
            detail:
                'GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET ortam değişkenleri ' +
                'tanımlanmış olmalı.\n\n' +
                'Geliştirme için proje kökündeki .env dosyasını oluşturun ' +
                '(.env.example referans alın).\n\n' +
                'Production build\'lerde bu değerler build sırasında inline edilir; ' +
                'binary kullanıcının makinesinde .env aramaz.',
        };
    }
    return null;
}

function validateUserDataWritable(): FailureDetail | null {
    try {
        const userData = app.getPath('userData');
        if (!fs.existsSync(userData)) {
            fs.mkdirSync(userData, { recursive: true });
        }
        const probe = path.join(userData, '.boot-check-probe');
        fs.writeFileSync(probe, 'ok', { encoding: 'utf-8' });
        fs.unlinkSync(probe);
        return null;
    } catch (err) {
        return {
            title: 'Yazma İzni Yok',
            message: 'GoWorks başlatılamadı: Uygulama veri klasörüne yazılamıyor.',
            detail:
                'GoWorks ayarlarını ve önbelleğini saklamak için userData ' +
                'klasörüne yazma izni gerekiyor.\n\n' +
                'Hata: ' + (err instanceof Error ? err.message : String(err)),
        };
    }
}

function checkServiceAccount(): boolean {
    try {
        const userData = app.getPath('userData');
        const saPath = path.join(userData, 'secrets', 'service-account.json');
        if (!fs.existsSync(saPath)) return true; // yok = missing
        const raw = fs.readFileSync(saPath, 'utf-8');
        const json = JSON.parse(raw) as {
            type?: string;
            client_email?: string;
            private_key?: string;
        };
        const valid =
            json.type === 'service_account' && !!json.client_email && !!json.private_key;
        return !valid;
    } catch {
        return true; // parse hatası = missing
    }
}

export interface BootCheckResult {
    soft: {
        serviceAccountMissing: boolean;
    };
}

/**
 * Çağıran: `electron/main.ts` `app.whenReady()` sonrası. Hard-fail durumunda
 * dialog gösterir ve `app.exit(1)` çağırır — bu fonksiyon `throw` da atar ki
 * çağıran kod akışı devam etmesin.
 */
export function runBootCheck(): BootCheckResult {
    if (process.env.GOWORKS_SKIP_BOOT_CHECK === '1') {
        logger.warn(
            '[boot-check] GOWORKS_SKIP_BOOT_CHECK=1 — kontroller atlanıyor (yalnızca development için).',
        );
        return { soft: { serviceAccountMissing: false } };
    }

    const hardChecks: Array<{ name: string; fn: () => FailureDetail | null }> = [
        { name: 'oauth-credentials', fn: validateOAuthCredentials },
        { name: 'userdata-writable', fn: validateUserDataWritable },
    ];

    for (const { name, fn } of hardChecks) {
        const failure = fn();
        if (failure) {
            logger.error(`[boot-check] HARD FAIL (${name}):`, failure.message);
            dialog.showErrorBox(failure.title, `${failure.message}\n\n${failure.detail}`);
            app.exit(1);
            // app.exit() async — kalan kod çalışmasın diye throw at
            throw new Error(`[boot-check] ${name}: ${failure.message}`);
        }
    }

    const serviceAccountMissing = checkServiceAccount();
    if (serviceAccountMissing) {
        logger.warn(
            '[boot-check] Service Account JSON yok ya da geçersiz — DWD özellikleri (imza push, audit) devre dışı.',
        );
    }

    logger.info('[boot-check] Tüm sert kontroller geçti.');
    return { soft: { serviceAccountMissing } };
}
