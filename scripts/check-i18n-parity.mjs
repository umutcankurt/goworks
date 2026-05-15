#!/usr/bin/env node
/**
 * i18n parity check.
 *
 * src/i18n/locales/tr/*.json ve src/i18n/locales/en/*.json arasında
 * key farkı arar. Eksik key'leri rapor eder ve fark varsa exit code 1.
 *
 * Kural: yeni bir t('xxx') eklenince aynı commit'te TR + EN
 * güncellenmeli.
 *
 * Çalıştırma: npm run i18n:check
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.join(process.cwd(), 'src', 'i18n', 'locales');

function flattenKeys(obj, prefix = '') {
    const keys = new Set();
    if (obj === null || typeof obj !== 'object') return keys;
    for (const [key, value] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            for (const k of flattenKeys(value, full)) keys.add(k);
        } else {
            keys.add(full);
        }
    }
    return keys;
}

function loadNamespace(lang, file) {
    const filePath = path.join(LOCALES_DIR, lang, file);
    const raw = readFileSync(filePath, 'utf-8');
    return flattenKeys(JSON.parse(raw));
}

const trFiles = new Set(
    readdirSync(path.join(LOCALES_DIR, 'tr')).filter((f) => f.endsWith('.json')),
);
const enFiles = new Set(
    readdirSync(path.join(LOCALES_DIR, 'en')).filter((f) => f.endsWith('.json')),
);

let hasMismatch = false;
const reports = [];

for (const f of trFiles) {
    if (!enFiles.has(f)) {
        reports.push(`✗ ${f} TR'de var, EN'de YOK`);
        hasMismatch = true;
    }
}
for (const f of enFiles) {
    if (!trFiles.has(f)) {
        reports.push(`✗ ${f} EN'de var, TR'de YOK`);
        hasMismatch = true;
    }
}

const sharedFiles = [...trFiles].filter((f) => enFiles.has(f));

for (const file of sharedFiles) {
    const trKeys = loadNamespace('tr', file);
    const enKeys = loadNamespace('en', file);

    const onlyInTr = [...trKeys].filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !trKeys.has(k));

    if (onlyInTr.length || onlyInEn.length) {
        reports.push(`\n📄 ${file}`);
        if (onlyInTr.length) {
            reports.push(`  TR'de var, EN'de yok (${onlyInTr.length}):`);
            onlyInTr.forEach((k) => reports.push(`    - ${k}`));
        }
        if (onlyInEn.length) {
            reports.push(`  EN'de var, TR'de yok (${onlyInEn.length}):`);
            onlyInEn.forEach((k) => reports.push(`    - ${k}`));
        }
        hasMismatch = true;
    }
}

if (hasMismatch) {
    for (const line of reports) console.error(line);
    process.exit(1);
}

console.log(
    `✓ i18n parity OK — ${sharedFiles.length} namespace, TR ve EN tutarlı.`,
);
