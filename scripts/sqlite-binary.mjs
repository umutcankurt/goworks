#!/usr/bin/env node
/**
 * SQLite native binary swap — dev (Electron ABI) ↔ test (Node ABI).
 *
 * Faz 32 garantisi: `npm run dev` daima Electron ABI binary'sine ihtiyaç
 * duyar. vitest ise saf Node worker'ında çalıştığı için Node ABI ister.
 * Bu script iki binary'yi `node_modules/.cache/goworks-sqlite/`'ta cache'ler
 * ve `pretest`/`posttest` hook'larında milisaniyelik `cp` ile swap'lar.
 *
 * Cache anahtarı: `{mode}-{abi}-{platform}-{arch}.node` — runtime başına
 * bir entry. ABI farkı `process.versions.modules` üzerinden çözülür.
 *
 * Komutlar:
 *   cache <electron|node>   — Mevcut binary'yi sniff'le, modu doğrula, cache'le.
 *   use   <electron|node>   — Cache'ten binary'yi ana lokasyona kopyala.
 *   prepare-test            — Tek seferlik: hem Electron hem Node ABI'yi derle ve cache'le.
 *   status                  — Mevcut binary + cache durumunu raporla.
 *
 * Magic-byte sniff mantığı `scripts/check-native-abi.mjs` ile aynıdır;
 * duplikasyon küçük ve test edilmiş — DRY refactor opsiyonel (plan §1.2).
 */
import {
    existsSync,
    openSync,
    readSync,
    closeSync,
    copyFileSync,
    mkdirSync,
    rmSync,
    statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const HR = '━'.repeat(76);

function banner(lines) {
    process.stderr.write(`\n${HR}\n${lines.join('\n')}\n${HR}\n\n`);
}

function fail(msg, hint) {
    banner([`[sqlite-binary] ${msg}`, hint ? `  ${hint}` : null].filter(Boolean));
    process.exit(1);
}

/**
 * Magic byte parse — `check-native-abi.mjs` ile aynı algoritma.
 * Sadece host platform/arch eşleşmesi için kullanılır; ABI bilgisi
 * (NODE_MODULE_VERSION) buradan çıkartılamaz — onu `require()` ile
 * runtime'da test ederiz.
 */
function parseBinaryMagic(buf) {
    if (!buf || buf.length < 16) return { platform: 'unknown', arch: 'unknown' };
    const magicLE = buf.readUInt32LE(0);
    const magicBE = buf.readUInt32BE(0);

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
    if (magicBE === 0xcafebabe) {
        return { platform: 'darwin', arch: 'universal' };
    }
    if (buf.readUInt16LE(0) === 0x5a4d) {
        return { platform: 'win32', arch: 'unknown' };
    }
    if (magicLE === 0x464c457f) {
        if (buf.length < 0x14) return { platform: 'linux', arch: 'unknown' };
        const eMachine = buf.readUInt16LE(0x12);
        const arch = eMachine === 0x3e ? 'x64' : eMachine === 0xb7 ? 'arm64' : 'unknown';
        return { platform: 'linux', arch };
    }
    return { platform: 'unknown', arch: 'unknown' };
}

function readMagic(filePath) {
    const fd = openSync(filePath, 'r');
    try {
        const buf = Buffer.alloc(32);
        readSync(fd, buf, 0, 32, 0);
        return buf;
    } finally {
        closeSync(fd);
    }
}

function resolveBinaryPath() {
    const require = createRequire(import.meta.url);
    try {
        const pkgPath = require.resolve('better-sqlite3/package.json');
        return path.join(path.dirname(pkgPath), 'build', 'Release', 'better_sqlite3.node');
    } catch {
        return path.join(
            process.cwd(),
            'node_modules',
            'better-sqlite3',
            'build',
            'Release',
            'better_sqlite3.node',
        );
    }
}

const CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'goworks-sqlite');

/**
 * Cache entry adı = `{mode}-{platform}-{arch}.node`. ABI numarası dahil
 * değil çünkü:
 *   - Electron ABI sürüm bumped olduğunda postinstall yeniden cache'ler
 *   - Node ABI sürüm bumped olduğunda test:prepare yeniden cache'ler
 *   - Cache miss durumu açık hata ile çıkar (`use` komutu)
 * Bu sade isim cross-platform pull'larda da net invalidate'e yardım eder.
 */
function cacheKey(mode) {
    return `${mode}-${process.platform}-${process.arch}.node`;
}

function cachedPath(mode) {
    return path.join(CACHE_DIR, cacheKey(mode));
}

function ensureCacheDir() {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Binary'nin `mode` ile uyumlu olduğunu doğrula:
 *  - platform/arch host'la eşleşmeli (magic-byte sniff)
 *  - `electron` modu için `require('better-sqlite3')` Node'da PATLAMALI
 *    (Electron ABI Node'da yüklenmez)
 *  - `node` modu için `require('better-sqlite3')` Node'da BAŞARILI olmalı
 */
function verifyBinaryMode(binaryPath, mode) {
    const buf = readMagic(binaryPath);
    const binInfo = parseBinaryMagic(buf);
    const host = { platform: process.platform, arch: process.arch };

    if (binInfo.platform !== host.platform) {
        return {
            ok: false,
            reason: `binary platform=${binInfo.platform}, host=${host.platform} — cross-platform binary cache'lenemez`,
        };
    }
    if (binInfo.arch !== 'unknown' && binInfo.arch !== 'universal' && binInfo.arch !== host.arch) {
        return {
            ok: false,
            reason: `binary arch=${binInfo.arch}, host=${host.arch}`,
        };
    }

    // ABI doğrulaması: gerçek Database construction probe.
    // `require('better-sqlite3')` SADECE JS wrapper'ı yükler — `bindings()`
    // çağrısı `new Database()` zamanında gerçekleşir. Yani sadece require
    // ile ABI test edilemez; native binding'i tetiklemek için Database
    // constructor'ını çağırmak şart.
    const require = createRequire(import.meta.url);
    const resolvedKey = (() => {
        try { return require.resolve('better-sqlite3'); } catch { return null; }
    })();
    if (resolvedKey && require.cache[resolvedKey]) {
        delete require.cache[resolvedKey];
    }

    let constructed = false;
    let loadErr = null;
    try {
        const Database = require('better-sqlite3');
        const db = new Database(':memory:');
        db.close();
        constructed = true;
    } catch (err) {
        loadErr = err instanceof Error ? err.message : String(err);
    }

    if (mode === 'node') {
        if (!constructed) {
            return {
                ok: false,
                reason: `Node ABI binary bekleniyordu ama new Database() patladı: ${loadErr}`,
            };
        }
        return { ok: true };
    }

    // mode === 'electron': Node'da Database construction NODE_MODULE_VERSION
    // mismatch atmalı (Electron 40 ABI 143, vitest Node 25 ABI 141 vb.).
    if (constructed) {
        return {
            ok: false,
            reason: 'Electron ABI binary bekleniyordu ama Node\'da Database() oluşturulabildi (binary aslında Node ABI).',
        };
    }
    if (!loadErr || !/NODE_MODULE_VERSION/i.test(loadErr)) {
        return {
            ok: false,
            reason: `Electron ABI binary bekleniyordu, new Database() farklı bir nedenle patladı: ${loadErr}`,
        };
    }
    return { ok: true };
}

function cmdCache(mode) {
    const binaryPath = resolveBinaryPath();
    if (!existsSync(binaryPath)) {
        fail(
            `cache ${mode} — binary bulunamadı: ${binaryPath}`,
            `Çalıştır: ${mode === 'electron' ? 'npm run rebuild' : 'npm rebuild better-sqlite3 --build-from-source'}`,
        );
    }
    const verdict = verifyBinaryMode(binaryPath, mode);
    if (!verdict.ok) {
        fail(`cache ${mode} — sanity check başarısız: ${verdict.reason}`);
    }
    ensureCacheDir();
    const dest = cachedPath(mode);
    copyFileSync(binaryPath, dest);
    const size = statSync(dest).size;
    console.log(`✓ [sqlite-binary] cached → ${path.relative(process.cwd(), dest)} (${size} bytes)`);
}

function cmdUse(mode) {
    const src = cachedPath(mode);
    if (!existsSync(src)) {
        const hint =
            mode === 'electron'
                ? 'Çalıştır: npm run rebuild   (Electron ABI binary derler ve cache\'ler)'
                : 'Çalıştır: npm run test:prepare   (Node ABI binary derler ve cache\'ler)';
        fail(`use ${mode} — cache miss: ${path.relative(process.cwd(), src)}`, hint);
    }
    const binaryPath = resolveBinaryPath();
    if (!existsSync(path.dirname(binaryPath))) {
        mkdirSync(path.dirname(binaryPath), { recursive: true });
    }
    copyFileSync(src, binaryPath);
    console.log(`✓ [sqlite-binary] ${mode} ABI binary aktif (${path.relative(process.cwd(), binaryPath)})`);
}

function runStep(label, cmd, args) {
    process.stderr.write(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}\n`);
    const npmCmd = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
    const result = spawnSync(npmCmd, args, { stdio: 'inherit', env: process.env });
    if (result.status !== 0) {
        fail(`${label} başarısız (exit ${result.status})`);
    }
}

function cmdPrepareTest({ force = false } = {}) {
    const nodeCache = cachedPath('node');
    const electronCache = cachedPath('electron');
    if (!force && existsSync(nodeCache) && existsSync(electronCache)) {
        console.log(
            `✓ [sqlite-binary] prepare-test: cache zaten dolu (node + electron) — atlanıyor. ` +
            `Yeniden derlemek için: node scripts/sqlite-binary.mjs prepare-test --force`,
        );
        return;
    }

    // `@electron/rebuild` ve `electron-builder install-app-deps` incremental:
    // `build/Release/.forge-meta`'ya bakıp "zaten doğru ABI" derse derlemeyi
    // atlar ve final `.node` dosyasını GÜNCELLEMEZ. `npm rebuild` + ardından
    // `electron-rebuild` zincirinde, ikinci komut forge-meta'yı doğru güncelliyor
    // ama binary'yi kopyalamıyor → her iki derleme sonrası da binary Node ABI'sinde
    // kalıyor. Bunu önlemek için her derleme öncesi `build/` klasörünü tamamen
    // sil — node-gyp temiz başlasın.

    function purgeBuildDir() {
        const buildDir = path.join(path.dirname(resolveBinaryPath()), '..', '..');
        const target = path.join(buildDir, 'build');
        if (existsSync(target)) {
            rmSync(target, { recursive: true, force: true });
        }
    }

    // 1) Node ABI ile derle ve cache'le.
    purgeBuildDir();
    runStep('Node ABI derleme', 'npm', ['rebuild', 'better-sqlite3']);
    cmdCache('node');

    // 2) Electron ABI'ye geri derle ve cache'le.
    purgeBuildDir();
    runStep('Electron ABI derleme', 'npx', ['electron-builder', 'install-app-deps']);
    cmdCache('electron');

    console.log('\n✓ [sqlite-binary] prepare-test tamamlandı. Artık `npm test` swap ile çalışır.');
}

function cmdStatus() {
    const binaryPath = resolveBinaryPath();
    const electronCache = cachedPath('electron');
    const nodeCache = cachedPath('node');
    console.log(`Binary:  ${binaryPath}`);
    console.log(`  exists: ${existsSync(binaryPath)}`);
    if (existsSync(binaryPath)) {
        const info = parseBinaryMagic(readMagic(binaryPath));
        console.log(`  magic:  ${info.platform}/${info.arch}`);
    }
    console.log(`Cache:   ${CACHE_DIR}`);
    console.log(`  electron: ${existsSync(electronCache) ? 'present' : 'missing'}`);
    console.log(`  node:     ${existsSync(nodeCache) ? 'present' : 'missing'}`);
}

function main() {
    const [, , subcommand, arg, ...rest] = process.argv;
    switch (subcommand) {
        case 'cache':
            if (arg !== 'electron' && arg !== 'node') {
                fail(`cache: <electron|node> beklendi, "${arg}" geldi.`);
            }
            cmdCache(arg);
            break;
        case 'use':
            if (arg !== 'electron' && arg !== 'node') {
                fail(`use: <electron|node> beklendi, "${arg}" geldi.`);
            }
            cmdUse(arg);
            break;
        case 'prepare-test':
            cmdPrepareTest({ force: rest.includes('--force') || arg === '--force' });
            break;
        case 'status':
            cmdStatus();
            break;
        default:
            fail(
                `bilinmeyen komut: "${subcommand}"`,
                'Kullanım: sqlite-binary.mjs <cache|use|prepare-test|status> [arg]',
            );
    }
}

main();
