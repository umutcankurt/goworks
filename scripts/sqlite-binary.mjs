#!/usr/bin/env node
/**
 * SQLite native binary swap — dev (Electron ABI) ↔ test (Node ABI).
 *
 * Phase 32 guarantee: `npm run dev` always needs the Electron ABI binary.
 * vitest, on the other hand, runs in a pure Node worker, so it wants the
 * Node ABI. This script caches both binaries in
 * `node_modules/.cache/goworks-sqlite/` and swaps them with a millisecond
 * `cp` in the `pretest`/`posttest` hooks.
 *
 * Cache key: `{mode}-{abi}-{platform}-{arch}.node` — one entry per runtime.
 * The ABI difference is resolved via `process.versions.modules`.
 *
 * Commands:
 *   cache <electron|node>   — Sniff the current binary, verify the mode, cache it.
 *   use   <electron|node>   — Copy the binary from cache to the main location.
 *   prepare-test            — One-time: build and cache both Electron and Node ABI.
 *   status                  — Report the current binary + cache state.
 *
 * The magic-byte sniff logic is the same as `scripts/check-native-abi.mjs`;
 * the duplication is small and tested — a DRY refactor is optional (plan §1.2).
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
 * Magic byte parse — same algorithm as `check-native-abi.mjs`.
 * Used only for host platform/arch matching; the ABI info
 * (NODE_MODULE_VERSION) cannot be derived from here — we test that at
 * runtime via `require()`.
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
 * Cache entry name = `{mode}-{platform}-{arch}.node`. The ABI number is not
 * included because:
 *   - When the Electron ABI version is bumped, postinstall re-caches
 *   - When the Node ABI version is bumped, test:prepare re-caches
 *   - A cache miss exits with an explicit error (`use` command)
 * This simple name also helps with clean invalidation across cross-platform pulls.
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
 * Verify that the binary is compatible with `mode`:
 *  - platform/arch must match the host (magic-byte sniff)
 *  - for `electron` mode, `require('better-sqlite3')` must FAIL on Node
 *    (the Electron ABI does not load on Node)
 *  - for `node` mode, `require('better-sqlite3')` must SUCCEED on Node
 */
function verifyBinaryMode(binaryPath, mode) {
    const buf = readMagic(binaryPath);
    const binInfo = parseBinaryMagic(buf);
    const host = { platform: process.platform, arch: process.arch };

    if (binInfo.platform !== host.platform) {
        return {
            ok: false,
            reason: `binary platform=${binInfo.platform}, host=${host.platform} — cross-platform binary cannot be cached`,
        };
    }
    if (binInfo.arch !== 'unknown' && binInfo.arch !== 'universal' && binInfo.arch !== host.arch) {
        return {
            ok: false,
            reason: `binary arch=${binInfo.arch}, host=${host.arch}`,
        };
    }

    // ABI verification: a real Database construction probe.
    // `require('better-sqlite3')` ONLY loads the JS wrapper — the `bindings()`
    // call happens at `new Database()` time. So the ABI cannot be tested with
    // require alone; calling the Database constructor is required to trigger
    // the native binding.
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
                reason: `Expected a Node ABI binary but new Database() failed: ${loadErr}`,
            };
        }
        return { ok: true };
    }

    // mode === 'electron': on Node, Database construction must throw a
    // NODE_MODULE_VERSION mismatch (Electron 40 ABI 143, vitest Node 25 ABI 141, etc.).
    if (constructed) {
        return {
            ok: false,
            reason: 'Expected an Electron ABI binary but Database() could be created on Node (the binary is actually Node ABI).',
        };
    }
    if (!loadErr || !/NODE_MODULE_VERSION/i.test(loadErr)) {
        return {
            ok: false,
            reason: `Expected an Electron ABI binary, but new Database() failed for a different reason: ${loadErr}`,
        };
    }
    return { ok: true };
}

function cmdCache(mode) {
    const binaryPath = resolveBinaryPath();
    if (!existsSync(binaryPath)) {
        fail(
            `cache ${mode} — binary not found: ${binaryPath}`,
            `Run: ${mode === 'electron' ? 'npm run rebuild' : 'npm rebuild better-sqlite3 --build-from-source'}`,
        );
    }
    const verdict = verifyBinaryMode(binaryPath, mode);
    if (!verdict.ok) {
        fail(`cache ${mode} — sanity check failed: ${verdict.reason}`);
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
                ? 'Run: npm run rebuild   (builds and caches the Electron ABI binary)'
                : 'Run: npm run test:prepare   (builds and caches the Node ABI binary)';
        fail(`use ${mode} — cache miss: ${path.relative(process.cwd(), src)}`, hint);
    }
    const binaryPath = resolveBinaryPath();
    if (!existsSync(path.dirname(binaryPath))) {
        mkdirSync(path.dirname(binaryPath), { recursive: true });
    }
    copyFileSync(src, binaryPath);
    console.log(`✓ [sqlite-binary] ${mode} ABI binary active (${path.relative(process.cwd(), binaryPath)})`);
}

function runStep(label, cmd, args) {
    process.stderr.write(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}\n`);
    const npmCmd = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
    const result = spawnSync(npmCmd, args, { stdio: 'inherit', env: process.env });
    if (result.status !== 0) {
        fail(`${label} failed (exit ${result.status})`);
    }
}

function cmdPrepareTest({ force = false } = {}) {
    const nodeCache = cachedPath('node');
    const electronCache = cachedPath('electron');
    if (!force && existsSync(nodeCache) && existsSync(electronCache)) {
        console.log(
            `✓ [sqlite-binary] prepare-test: cache already populated (node + electron) — skipping. ` +
            `To rebuild: node scripts/sqlite-binary.mjs prepare-test --force`,
        );
        return;
    }

    // `@electron/rebuild` and `electron-builder install-app-deps` are incremental:
    // they look at `build/Release/.forge-meta` and if it says "already the correct
    // ABI" they skip the build and DO NOT UPDATE the final `.node` file. In the
    // `npm rebuild` + then `electron-rebuild` chain, the second command updates
    // forge-meta correctly but does not copy the binary → after both builds the
    // binary stays at the Node ABI. To prevent this, fully delete the `build/`
    // folder before each build — let node-gyp start clean.

    function purgeBuildDir() {
        const buildDir = path.join(path.dirname(resolveBinaryPath()), '..', '..');
        const target = path.join(buildDir, 'build');
        if (existsSync(target)) {
            rmSync(target, { recursive: true, force: true });
        }
    }

    // NOTE: the `require('better-sqlite3')` probe inside cmdCache loads the
    // native binding via dlopen. The same .node file cannot be loaded twice
    // within one process — the second probe (electron) sees the first-loaded
    // (node) ABI and makes a wrong diagnosis. To prevent this, we run each
    // cache step in a separate child process.
    function spawnCache(mode) {
        runStep(`Cache ${mode}`, process.execPath, [
            new URL(import.meta.url).pathname,
            'cache',
            mode,
        ]);
    }

    // 1) Build with the Node ABI and cache it.
    purgeBuildDir();
    runStep('Node ABI build', 'npm', ['rebuild', 'better-sqlite3']);
    spawnCache('node');

    // 2) Build back to the Electron ABI and cache it.
    // NOTE: `electron-builder install-app-deps` downloads the Node ABI prebuilt
    // for better-sqlite3 and places it as a fallback (there is no Electron 40
    // prebuilt). `@electron/rebuild` produces the real Electron ABI binary
    // directly with a force build.
    purgeBuildDir();
    runStep('Electron ABI build', 'npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);
    spawnCache('electron');

    console.log('\n✓ [sqlite-binary] prepare-test complete. `npm test` now works with the swap.');
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
                fail(`cache: expected <electron|node>, got "${arg}".`);
            }
            cmdCache(arg);
            break;
        case 'use':
            if (arg !== 'electron' && arg !== 'node') {
                fail(`use: expected <electron|node>, got "${arg}".`);
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
                `unknown command: "${subcommand}"`,
                'Usage: sqlite-binary.mjs <cache|use|prepare-test|status> [arg]',
            );
    }
}

main();
