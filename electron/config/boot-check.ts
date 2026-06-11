/**
 * GoWorks boot-time config validation + .env migration.
 *
 * Called VERY EARLY after `app.whenReady()`. Two levels + a one-time
 * migration step:
 *
 * 0. Migration (idempotent):
 *    - .env: If the .env file at the project root has GOOGLE_CLIENT_ID or
 *      GOOGLE_CLIENT_SECRET and they haven't been moved to app_config / safeStorage
 *      yet, they are copied there. In production .env → .env.migrated is renamed;
 *      if the rename fails, the CLIENT_* lines are removed line-by-line.
 *      In development the .env file is left untouched (so the local flow isn't broken).
 *    - Service Account: The legacy plaintext `secrets/service-account.json` is moved
 *      to the encrypted `secrets/service-account.enc` store; after successful
 *      encryption the plaintext file is deleted (no plaintext private key on disk).
 *
 * 1. Hard-fail: `dialog.showErrorBox` + `app.exit(1)`. Only:
 *    - userData folder is not writable
 *    A missing OAuth credential is NO LONGER a hard-fail — the onboarding wizard
 *    takes over.
 *
 * 2. Soft-warn: logger.warn + return flag. Missing:
 *    - service-account.enc is absent or cannot be decrypted/parsed
 *
 * Dev override: the `GOWORKS_SKIP_BOOT_CHECK=1` env variable skips all checks.
 */
import { app, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import * as dotenv from 'dotenv';
import { logger } from '../services/logger';
import { appConfigService } from '../services/app-config-service';
import { secureStorage, serviceAccountStore } from '../services/secure-storage';
import { getStatus } from '../secrets/service-account-loader';

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
 * Native module probe — hard-fail if the better-sqlite3 binary's platform/arch
 * doesn't match the host or if `require()` blows up.
 *
 * First a magic byte sniff (~32 byte read, doesn't trigger dlopen), then an actual
 * `require()` that also catches a NODE_MODULE_VERSION mismatch. The combination of
 * the two layers: the sniff catches arch mismatch, the require catches ABI mismatch.
 *
 * This check must run BEFORE `runEnvMigration()` because the migration triggers the
 * `appConfigService.get()` → `getDb()` chain; if the native module is incompatible
 * the migration fails with an unhelpful crash.
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

    // 1) Magic byte sniff (cheap, doesn't trigger dlopen)
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
            // If the sniff fails, fall through to the require probe.
        }
    }

    // 2) Probe load — here we catch the NODE_MODULE_VERSION mismatch the sniff
    // can't (correct arch, wrong Electron ABI).
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
    // true = missing/invalid. getStatus() reads from the encrypted store
    // (service-account.enc); if safeStorage is unavailable or the content is
    // corrupt it returns configured:false.
    try {
        return !getStatus().configured;
    } catch {
        return true;
    }
}

/**
 * Moves the legacy plaintext Service Account key (`secrets/service-account.json`)
 * into the encrypted store (`secrets/service-account.enc`).
 *
 * - Skipped if the plaintext file doesn't exist.
 * - If `.enc` already exists: the leftover plaintext file is still deleted (no
 *   plaintext private key on disk) and the migration is skipped.
 * - If encryption succeeds, the plaintext file is deleted — it is NOT renamed to
 *   `.migrated`, because that would also leave a plaintext private key on disk.
 * - If safeStorage is unavailable, the plaintext file is KEPT (the only copy isn't destroyed).
 * All steps are idempotent.
 */
function runServiceAccountMigration(): void {
    const plainPath = path.join(app.getPath('userData'), 'secrets', 'service-account.json');
    if (!fs.existsSync(plainPath)) return;

    if (serviceAccountStore.has()) {
        try {
            fs.unlinkSync(plainPath);
            logger.info('[boot-check] Artakalan düz service-account.json silindi (.enc zaten mevcut).');
        } catch (err) {
            logger.warn('[boot-check] Artakalan düz service-account.json silinemedi:', err);
        }
        return;
    }

    let raw: string;
    try {
        raw = fs.readFileSync(plainPath, 'utf-8');
    } catch (err) {
        logger.warn('[boot-check] Düz service-account.json okunamadı, migration atlanıyor:', err);
        return;
    }

    // Don't destroy unverifiable data — only valid SA JSON is migrated.
    try {
        const json = JSON.parse(raw) as {
            type?: string;
            client_email?: string;
            private_key?: string;
        };
        const valid =
            json.type === 'service_account' && !!json.client_email && !!json.private_key;
        if (!valid) {
            logger.warn('[boot-check] Düz service-account.json geçersiz — migration atlanıyor, dosya korunuyor.');
            return;
        }
    } catch {
        logger.warn('[boot-check] Düz service-account.json parse edilemedi — migration atlanıyor, dosya korunuyor.');
        return;
    }

    try {
        serviceAccountStore.set(raw);
    } catch (err) {
        // safeStorage unavailable — keep the plaintext file so the only copy isn't lost.
        logger.warn('[boot-check] Service Account şifreli depoya yazılamadı, düz dosya korunuyor:', err);
        return;
    }

    try {
        fs.unlinkSync(plainPath);
        logger.info('[boot-check] service-account.json → service-account.enc (şifreli depoya taşındı, düz dosya silindi).');
    } catch (err) {
        logger.warn('[boot-check] Şifreli kopya yazıldı ama düz service-account.json silinemedi:', err);
    }
}

/**
 * Automatically migrates legacy `.env`-based setups to app_config + safeStorage.
 *
 * - clientId is written only if googleClientId in app_config is empty.
 * - secret is written only if there's no secret in safeStorage.
 * - In production, .env cleanup is applied after migration.
 * - All steps are idempotent: skipped if the value is already in place.
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
            // safeStorage may be unavailable (Linux headless, etc.). Even if the
            // migration fails the app keeps starting; the user can re-enter the
            // value via onboarding.
            logger.warn('[boot-check] clientSecret migration başarısız:', err);
        }
    }

    if (!migratedAnything) return;

    // .env cleanup in production. We don't touch it in dev so the `npm run dev`
    // flow isn't broken.
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

    // Fallback: if the rename failed, clean up the lines instead.
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
 * Caller: `electron/main.ts` after `app.whenReady()`. On a hard-fail it shows a
 * dialog and calls `app.exit(1)`.
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

    // Native module probe FIRST — runEnvMigration() and everything after it call
    // the DB; if better-sqlite3 blows up, the whole downstream enters an
    // unpredictable chain.
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

    // Migration: after the hard-checks pass cleanly; once app_config is populated
    // all downstream checks see the correct values.
    try {
        runEnvMigration();
    } catch (err) {
        logger.warn('[boot-check] runEnvMigration() beklenmeyen hata:', err);
    }

    // Service Account migration: must run BEFORE checkServiceAccount() so that
    // getStatus() sees the freshly encrypted .enc file.
    try {
        runServiceAccountMigration();
    } catch (err) {
        logger.warn('[boot-check] runServiceAccountMigration() beklenmeyen hata:', err);
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
