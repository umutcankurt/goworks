#!/usr/bin/env node
/**
 * Native ABI parity check — predev hook.
 *
 * better-sqlite3'ün derlenmiş `.node` binary'sini host platform/arch ile
 * karşılaştırır. Cross-platform `npm run build` (-mw) sonrası dev makinesine
 * dönüldüğünde binary yanlış platform/ABI ile kalabilir; bu da Electron'da
 * "No handler registered for 'X'" zincir hatasına yol açar.
 *
 * Modlar:
 *   default — mismatch'te `npm run rebuild`'i otomatik tetikler, görünür banner basar.
 *   strict  — mismatch'te exit 1, manuel `npm run rebuild` ister.
 *             Tetikleyici: CHECK_NATIVE_ABI_STRICT=1 veya CI=true (GitHub Actions vs.)
 *
 * Strateji: magic byte sniff (ilk 32 byte) — Mach-O / PE / ELF tespit eder.
 * Dış bağımlılık yok (`file` komutu gibi platform-bağımlı araçlardan kaçınıldı).
 */
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const STRICT =
    process.env.CHECK_NATIVE_ABI_STRICT === '1' ||
    process.env.CI === 'true' ||
    process.env.CI === '1';

const HR = '━'.repeat(76);

function banner(lines) {
    process.stderr.write(`\n${HR}\n${lines.join('\n')}\n${HR}\n\n`);
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

/**
 * Magic byte parse — saf fonksiyon, test edilebilir.
 * Buffer'ın ilk 32 byte'ı yeterli.
 */
export function parseBinaryMagic(buf) {
    if (!buf || buf.length < 16) return { platform: 'unknown', arch: 'unknown' };

    const magicLE = buf.readUInt32LE(0);
    const magicBE = buf.readUInt32BE(0);

    // Mach-O 64-bit (macOS) — magic 0xFEEDFACF (LE host)
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

function readBinaryHead(filePath) {
    const fd = openSync(filePath, 'r');
    try {
        const buf = Buffer.alloc(32);
        readSync(fd, buf, 0, 32, 0);
        return buf;
    } finally {
        closeSync(fd);
    }
}

function isCompatible(binary, host) {
    if (binary.platform !== host.platform) return false;
    if (binary.arch === 'universal') return host.platform === 'darwin';
    if (binary.arch === 'unknown') return true; // arch detection eksik → şüpheliyiz ama match sayalım
    return binary.arch === host.arch;
}

function runRebuild() {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCmd, ['run', 'rebuild'], {
        stdio: 'inherit',
        env: process.env,
    });
    return result.status === 0;
}

function main() {
    const binaryPath = resolveBinaryPath();
    const host = { platform: process.platform, arch: process.arch };

    if (!existsSync(binaryPath)) {
        if (STRICT) {
            banner([
                '[check-native-abi] STRICT MODE — better-sqlite3 binary missing',
                `  expected at: ${binaryPath}`,
                '  Run:         npm run rebuild',
            ]);
            process.exit(1);
        }
        banner([
            '[check-native-abi] better-sqlite3 binary missing — first run?',
            `  expected at: ${binaryPath}`,
            '  Auto-running `npm run rebuild` (this may take ~30-60s)...',
        ]);
        process.exit(runRebuild() ? 0 : 1);
    }

    const head = readBinaryHead(binaryPath);
    const binary = parseBinaryMagic(head);

    if (isCompatible(binary, host)) {
        console.log(
            `✓ [check-native-abi] better-sqlite3 OK (${binary.platform}/${binary.arch === 'unknown' ? host.arch : binary.arch})`,
        );
        process.exit(0);
    }

    if (STRICT) {
        banner([
            '[check-native-abi] STRICT MODE — ABI mismatch detected, refusing to auto-rebuild',
            `  binary: ${binary.platform}/${binary.arch}`,
            `  host:   ${host.platform}/${host.arch}`,
            '',
            '  Run:    npm run rebuild',
        ]);
        process.exit(1);
    }

    banner([
        '[check-native-abi] ABI mismatch detected',
        `  binary: ${binary.platform}/${binary.arch}   ← önceki build'den kalmış`,
        `  host:   ${host.platform}/${host.arch}   ← şu anki sistem`,
        '',
        '  Auto-rebuilding native modules for development. This may take ~30-60s...',
    ]);
    process.exit(runRebuild() ? 0 : 1);
}

// ESM module: doğrudan çalıştırıldıysa main(). Import edildiyse (test için)
// sadece parseBinaryMagic export edilsin.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
    main();
}
