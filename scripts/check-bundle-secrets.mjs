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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['dist', 'dist-electron'];
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.map', '.txt']);

const PATTERNS = [
    // A real client secret is GOCSPX- plus ~28 URL-safe chars. The onboarding
    // i18n placeholder is the literal "GOCSPX-...", which the {20,} bound skips.
    { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
    { name: 'Google OAuth client ID', re: /\d{9,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/g },
    { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{30,}/g },
    { name: 'Private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
];

// Fixtures that legitimately ship in the bundle. Exact matches only.
const ALLOWLIST = new Set([
    '1234567890-demoprototypeclientid.apps.googleusercontent.com', // src/demo/data
]);

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (SCAN_EXT.has(path.extname(entry.name))) out.push(full);
    }
    return out;
}

const findings = [];
let scanned = 0;

for (const root of ROOTS) {
    const dir = path.join(process.cwd(), root);
    if (!existsSync(dir)) continue;

    for (const file of walk(dir)) {
        const content = readFileSync(file, 'utf-8');
        scanned += 1;

        for (const { name, re } of PATTERNS) {
            for (const match of content.matchAll(re)) {
                if (ALLOWLIST.has(match[0])) continue;
                findings.push({
                    file: path.relative(process.cwd(), file),
                    line: content.slice(0, match.index).split('\n').length,
                    name,
                    value: match[0],
                });
            }
        }
    }
}

if (findings.length) {
    console.error('\n✗ Credential-shaped strings found in the build output:\n');
    for (const f of findings) {
        const masked = `${f.value.slice(0, 12)}…${f.value.slice(-4)}`;
        console.error(`  ${f.file}:${f.line}`);
        console.error(`    ${f.name} — ${masked}\n`);
    }
    console.error('A shipped bundle must never carry a credential.');
    console.error('Check that dist/ and dist-electron/ were cleaned (npm run build does');
    console.error('this via prebuild) and that no source file hardcodes a secret.\n');
    process.exit(1);
}

console.log(`✓ Bundle secret scan OK — ${scanned} files, no credential-shaped strings.`);
