/**
 * GoWorks boot-time config validation + .env migration.
 *
 * `app.whenReady()` sonrası ÇOK ERKEN çağrılır. İki seviye + bir tek-seferlik
 * migration adımı:
 *
 * 0. Migration (idempotent): Proje kökündeki .env dosyasında GOOGLE_CLIENT_ID
 *    veya GOOGLE_CLIENT_SECRET varsa ve henüz app_config / safeStorage'a
 *    aktarılmadıysa, oraya kopyalanır. Production'da .env → .env.migrated
 *    rename edilir; rename başarısızsa CLIENT_* satırları satır-bazlı silinir.
 *    Development'ta .env dosyası dokunulmaz (yerel akış bozulmasın).
 *
 * 1. Hard-fail: `dialog.showErrorBox` + `app.exit(1)`. Sadece:
 *    - userData klasörü yazılabilir değil
 *    OAuth credential eksikliği artık hard-fail DEĞİL — onboarding sihirbazı
 *    devreye girer.
 *
 * 2. Soft-warn: logger.warn + return flag. Eksiklik:
 *    - service-account.json yok ya da parse edilemez
 *
 * Dev override: `GOWORKS_SKIP_BOOT_CHECK=1` env değişkeni ile tüm kontroller
 * atlanır.
 */
import { app, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import * as dotenv from 'dotenv';
import { logger } from '../services/logger';
import { appConfigService } from '../services/app-config-service';
import { secureStorage } from '../services/secure-storage';

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

/**
 * Native modül probe — better-sqlite3 binary'sinin platform/arch'ı host ile
 * uyuşmuyorsa veya `require()` patlıyorsa hard-fail.
 *
 * Önce magic byte sniff (~32 byte read, dlopen tetiklemez), sonra fiili
 * `require()` ile NODE_MODULE_VERSION mismatch'ini de yakalar. İki katmanın
 * birleşimi: sniff arch mismatch'ini yakalar, require ABI mismatch'ini yakalar.
 *
 * Bu kontrol `runEnvMigration()`'dan ÖNCE yapılmalı çünkü migration
 * `appConfigService.get()` → `getDb()` zincirini tetikliyor; eğer native modül
 * uyumsuzsa migration kullanışsız bir crash ile çöker.
 */
interface BinaryInfo {
    platform: string;
    arch: string;
}

function parseBinaryMagic(buf: Buffer): BinaryInfo {
    if (!buf || buf.length < 16) return { platform: 'unknown', arch: 'unknown' };

    const magicLE = buf.readUInt32LE(0);
    const magicBE = buf.readUInt32BE(0);

    // Mach-O 64-bit (macOS) — magic 0xFEEDFACF (LE)
    if (magicLE === 0xfeedfacf || magicLE === 0xcffaedfe) {
        const cputype = buf.readUInt32LE(4);
        const arch =
            cputype === 0x0100000c
                ? 'arm64'
                : cputype === 0x01000007
                  ? 'x64'
                  : 'unknown';
        return { platform: 'darwin', arch };
    }

    // Mach-O universal binary (fat) — 0xCAFEBABE (BE)
    if (magicBE === 0xcafebabe) {
        return { platform: 'darwin', arch: 'universal' };
    }

    // PE (Windows) — "MZ" prefix
    if (buf.readUInt16LE(0) === 0x5a4d) {
        return { platform: 'win32', arch: 'unknown' };
    }

    // ELF (Linux) — 0x7F 'E' 'L' 'F'
    if (magicLE === 0x464c457f) {
        if (buf.length < 0x14) return { platform: 'linux', arch: 'unknown' };
        const eMachine = buf.readUInt16LE(0x12);
        const arch =
            eMachine === 0x3e ? 'x64' : eMachine === 0xb7 ? 'arm64' : 'unknown';
        return { platform: 'linux', arch };
    }

    return { platform: 'unknown', arch: 'unknown' };
}

function isBinaryCompatible(binary: BinaryInfo, host: BinaryInfo): boolean {
    if (binary.platform !== host.platform) return false;
    if (binary.arch === 'universal') return host.platform === 'darwin';
    if (binary.arch === 'unknown') return true;
    return binary.arch === host.arch;
}

function resolveBetterSqliteBinary(): string | null {
    try {
        const requireFromHere = createRequire(import.meta.url);
        const pkgPath = requireFromHere.resolve('better-sqlite3/package.json');
        return path.join(
            path.dirname(pkgPath),
            'build',
            'Release',
            'better_sqlite3.node',
        );
    } catch {
        return null;
    }
}

const NATIVE_REMEDY =
    'Çözüm: Terminalden aşağıdaki komutu çalıştırın ve uygulamayı yeniden başlatın:\n\n' +
    '    npm run rebuild\n\n' +
    'Genellikle platformlar arası build aldıktan sonra (npm run build) dev ' +
    'makinenize geri döndüğünüzde bu yeniden derleme gerekir.';

function validateNativeModules(): FailureDetail | null {
    const host: BinaryInfo = { platform: process.platform, arch: process.arch };
    const binaryPath = resolveBetterSqliteBinary();

    // 1) Magic byte sniff (cheap, dlopen tetiklemez)
    if (binaryPath && fs.existsSync(binaryPath)) {
        try {
            const fd = fs.openSync(binaryPath, 'r');
            const buf = Buffer.alloc(32);
            try {
                fs.readSync(fd, buf, 0, 32, 0);
            } finally {
                fs.closeSync(fd);
            }
            const binary = parseBinaryMagic(buf);
            if (!isBinaryCompatible(binary, host)) {
                return {
                    title: 'Native Modül Uyumsuz',
                    message:
                        'GoWorks başlatılamadı — better-sqlite3 native modülü bu sistemle uyumsuz.',
                    detail:
                        `Tespit edilen: ${binary.platform}/${binary.arch}\n` +
                        `Beklenen:      ${host.platform}/${host.arch}\n\n` +
                        NATIVE_REMEDY,
                };
            }
        } catch (err) {
            logger.warn('[boot-check] native binary sniff başarısız:', err);
            // Sniff başarısızsa require probe'una düş.
        }
    }

    // 2) Probe load — sniff'in yakalayamadığı NODE_MODULE_VERSION mismatch'ini
    // (doğru arch, yanlış Electron ABI) burada yakalarız.
    try {
        const requireFromHere = createRequire(import.meta.url);
        requireFromHere('better-sqlite3');
        return null;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            title: 'Native Modül Uyumsuz',
            message:
                'GoWorks başlatılamadı — better-sqlite3 native modülü bu Electron sürümüyle uyumsuz.',
            detail: `Hata: ${msg}\n\n${NATIVE_REMEDY}`,
        };
    }
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
        return true;
    }
}

/**
 * Eski `.env` tabanlı kurulumları otomatik app_config + safeStorage'a taşı.
 *
 * - Sadece app_config'de googleClientId boşsa clientId yazılır.
 * - Sadece safeStorage'da secret yoksa secret yazılır.
 * - Production'da migration sonrası .env temizliği uygulanır.
 * - Tüm adımlar idempotent: değer zaten yerindeyse atlanır.
 */
function runEnvMigration(): void {
    const envPath = path.join(process.env.APP_ROOT ?? process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    let raw: string;
    try {
        raw = fs.readFileSync(envPath, 'utf-8');
    } catch (err) {
        logger.warn('[boot-check] .env okunamadı, migration atlanıyor:', err);
        return;
    }
    const parsed = dotenv.parse(raw);
    const envClientId = parsed.GOOGLE_CLIENT_ID;
    const envClientSecret = parsed.GOOGLE_CLIENT_SECRET;

    let migratedAnything = false;

    if (!isPlaceholder(envClientId) && !appConfigService.get('googleClientId')) {
        try {
            appConfigService.set('googleClientId', envClientId!);
            logger.info('[boot-check] .env → app_config: googleClientId migrated.');
            migratedAnything = true;
        } catch (err) {
            logger.warn('[boot-check] googleClientId migration başarısız:', err);
        }
    }

    if (!isPlaceholder(envClientSecret) && !secureStorage.hasClientSecret()) {
        try {
            secureStorage.setClientSecret(envClientSecret!);
            logger.info('[boot-check] .env → safeStorage: clientSecret migrated.');
            migratedAnything = true;
        } catch (err) {
            // safeStorage kullanılamıyor olabilir (Linux headless vb.). Migration
            // başarısız olsa da uygulama açılmaya devam; kullanıcı onboarding ile
            // yeniden girebilir.
            logger.warn('[boot-check] clientSecret migration başarısız:', err);
        }
    }

    if (!migratedAnything) return;

    // Production'da .env temizliği. Dev'de dokunmuyoruz ki `npm run dev` akışı
    // bozulmasın.
    if (!app.isPackaged) {
        logger.info('[boot-check] Development modu — .env dosyası korunuyor.');
        return;
    }

    const migratedPath = `${envPath}.migrated`;
    try {
        fs.renameSync(envPath, migratedPath);
        logger.info(`[boot-check] .env → ${path.basename(migratedPath)} (production cleanup).`);
        return;
    } catch (renameErr) {
        logger.warn(
            '[boot-check] .env rename başarısız, satır bazlı temizliğe geçiliyor:',
            renameErr,
        );
    }

    // Fallback: rename fail ettiyse satırları temizleyelim.
    try {
        const cleaned = raw
            .split(/\r?\n/)
            .filter(
                (line) =>
                    !/^\s*GOOGLE_CLIENT_ID\s*=/.test(line) &&
                    !/^\s*GOOGLE_CLIENT_SECRET\s*=/.test(line),
            )
            .join('\n');
        fs.writeFileSync(envPath, cleaned, 'utf-8');
        logger.info('[boot-check] .env içinden CLIENT_* satırları silindi.');
    } catch (writeErr) {
        logger.error('[boot-check] .env temizliği başarısız:', writeErr);
    }
}

export interface BootCheckResult {
    soft: {
        serviceAccountMissing: boolean;
        oauthCredentialsMissing: boolean;
    };
}

/**
 * Çağıran: `electron/main.ts` `app.whenReady()` sonrası. Hard-fail durumunda
 * dialog gösterir ve `app.exit(1)` çağırır.
 */
export function runBootCheck(): BootCheckResult {
    if (process.env.GOWORKS_SKIP_BOOT_CHECK === '1') {
        logger.warn(
            '[boot-check] GOWORKS_SKIP_BOOT_CHECK=1 — kontroller atlanıyor (yalnızca development için).',
        );
        return {
            soft: { serviceAccountMissing: false, oauthCredentialsMissing: false },
        };
    }

    // Native modül probe EN ÖNCE — runEnvMigration() ve sonrası DB'yi çağırıyor;
    // better-sqlite3 patlarsa downstream'in tamamı bilinmez bir zincire girer.
    const hardChecks: Array<{ name: string; fn: () => FailureDetail | null }> = [
        { name: 'native-modules', fn: validateNativeModules },
        { name: 'userdata-writable', fn: validateUserDataWritable },
    ];

    for (const { name, fn } of hardChecks) {
        const failure = fn();
        if (failure) {
            logger.error(`[boot-check] HARD FAIL (${name}):`, failure.message);
            dialog.showErrorBox(failure.title, `${failure.message}\n\n${failure.detail}`);
            app.exit(1);
            throw new Error(`[boot-check] ${name}: ${failure.message}`);
        }
    }

    // Migration: hard-check'ler temiz geçtikten sonra; app_config dolarsa
    // downstream tüm kontroller doğru değerleri görür.
    try {
        runEnvMigration();
    } catch (err) {
        logger.warn('[boot-check] runEnvMigration() beklenmeyen hata:', err);
    }

    const serviceAccountMissing = checkServiceAccount();
    if (serviceAccountMissing) {
        logger.warn(
            '[boot-check] Service Account JSON yok ya da geçersiz — DWD özellikleri (imza push, audit) devre dışı.',
        );
    }

    const oauthCredentialsMissing =
        !appConfigService.get('googleClientId') || !secureStorage.hasClientSecret();
    if (oauthCredentialsMissing) {
        logger.warn(
            '[boot-check] OAuth credentials eksik — onboarding sihirbazı kullanıcıdan toplayacak.',
        );
    }

    logger.info('[boot-check] Sert kontroller geçti.');
    return { soft: { serviceAccountMissing, oauthCredentialsMissing } };
}
