#!/usr/bin/env node
/**
 * Bundle secret scan.
 *
 * Scans the compiled output (dist/ + dist-electron/) for credential-shaped
 * strings and exits 1 on a hit, so electron-builder never packs a secret into
 * app.asar.
 *
 * Why this exists: v0.7.2–v0.7.7 shipped a real OAuth client secret. The source
 * tree was clean — but dist-electron/ was never cleaned between builds, so stale
 * chunks from a pre-onboarding generation (which still hardcoded the credential)
 * survived and were packed into the asar. The `prebuild` clean removes the
 * staleness; this gate proves the result.
 *
 * Run: node scripts/check-bundle-secrets.mjs   (wired into `npm run build`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOTS = ['dist', 'dist-electron'];

/**
 * Extensions that are never worth scanning. Everything else IS scanned.
 *
 * Inverted from an allowlist deliberately: the previous SCAN_EXT list omitted
 * .svg (which Vite emits into dist/assets), .wasm, .node, fonts, .yml and
 * extensionless files, so a credential in any of those sailed through.
 */
const SKIP_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp4', '.webm', '.zip', '.gz', '.7z', '.dmg', '.exe', '.blockmap',
]);

export const PATTERNS = [
    // A real client secret is GOCSPX- plus ~28 URL-safe chars. The onboarding
    // i18n placeholder is the literal "GOCSPX-...", which the {20,} bound skips.
    { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
    { name: 'Google OAuth client ID', re: /\d{9,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/g },
    { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{30,}/g },
    { name: 'Private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
    // The two secrets this app actually holds. Neither was covered before, and a
    // leaked refresh token is worth more than the client secret that leaked in
    // v0.7.2–v0.7.7: it is long-lived and directly redeemable.
    { name: 'Google OAuth refresh token', re: /1\/\/[0-9A-Za-z_-]{20,}/g },
    { name: 'Google OAuth access token', re: /ya29\.[0-9A-Za-z_-]{20,}/g },
    { name: 'Service account key JSON', re: /"type"\s*:\s*"service_account"/g },
];

// Fixtures that legitimately ship in the bundle. Exact matches only.
const ALLOWLIST = new Set([
    '1234567890-demoprototypeclientid.apps.googleusercontent.com', // src/demo/data
]);

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (!SKIP_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
    return out;
}

/**
 * Scan an arbitrary file for credential-shaped strings.
 *
 * Read as latin1, not utf-8, so this works on binary containers too — an
 * app.asar is a header plus concatenated file bodies, and every pattern here is
 * ASCII, so a secret inside the archive still matches.
 */
export function scanFile(file) {
    const content = readFileSync(file, 'latin1');
    const found = [];
    for (const { name, re } of PATTERNS) {
        for (const match of content.matchAll(re)) {
            if (ALLOWLIST.has(match[0])) continue;
            found.push({
                file,
                line: content.slice(0, match.index).split('\n').length,
                name,
                value: match[0],
            });
        }
    }
    return found;
}

/** Scan a directory tree (or a single file). Returns [findings, fileCount]. */
export function scanPath(target) {
    if (!existsSync(target)) return [[], 0];
    const files = statSync(target).isDirectory() ? walk(target) : [target];
    const findings = [];
    for (const file of files) findings.push(...scanFile(file));
    return [findings, files.length];
}

export function reportAndExit(findings, scanned, label) {
    if (findings.length) {
        console.error(`\n✗ Credential-shaped strings found in ${label}:\n`);
        for (const f of findings) {
            const masked = `${f.name} sha256:${createHash('sha256').update(f.value).digest('hex').slice(0, 12)}`;
            console.error(`  ${path.relative(process.cwd(), f.file)}:${f.line}`);
            console.error(`    ${masked}\n`);
        }
        console.error('A shipped bundle must never carry a credential.');
        console.error('Check that dist/ and dist-electron/ were cleaned (npm run build does');
        console.error('this via prebuild) and that no source file hardcodes a secret.\n');
        process.exit(1);
    }
    console.log(`✓ Bundle secret scan OK — ${label}, ${scanned} files, no credential-shaped strings.`);
}

/** Scan the build inputs (dist/ + dist-electron/). Used by the CLI and by beforePack. */
export function scanBuildOutput() {
    const findings = [];
    let scanned = 0;
    for (const root of ROOTS) {
        const [f, n] = scanPath(path.join(process.cwd(), root));
        findings.push(...f);
        scanned += n;
    }
    return { findings, scanned };
}

// CLI entry point only — importing this module must not run a scan.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { findings, scanned } = scanBuildOutput();
    reportAndExit(findings, scanned, 'build output');
}
