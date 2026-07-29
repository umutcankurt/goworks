#!/usr/bin/env node
/**
 * Keeps Settings → About's open-source attribution list honest.
 *
 * Two things drift silently here. A new runtime dependency ships to users
 * without ever being credited (that is how `@noble/hashes` — the crypto behind
 * the master-password vault — and `clsx` went unlisted). And a package can
 * change its license across a major without anyone re-reading the list.
 *
 * Neither shows up in lint, types or tests: the list is a plain array that
 * always renders. So this asserts both directions —
 *
 *   1. every `dependencies` entry is credited (or explicitly exempt below)
 *   2. every credited license matches what is actually installed
 *
 * Build-only tooling that is credited anyway (vite, tailwindcss, electron) is
 * fine — the list is attribution, not a manifest, and rule 2 still checks it.
 */
import { readFileSync } from 'node:fs';

const SETTINGS = 'src/pages/Settings.tsx';
const PKG = 'package.json';

/**
 * Entries whose display name is not a package name, mapped to the package(s)
 * they credit.
 */
const ALIASES = {
    React: ['react', 'react-dom'],
    'React Router': ['react-router-dom'],
    'i18next / react-i18next': ['i18next', 'react-i18next'],
};

/**
 * Runtime deps that need no separate credit line, with the reason. Keep this
 * short — the default answer for a new dependency is to credit it.
 */
const EXEMPT = {
    '@types/papaparse': 'type declarations only; no code ships',
};

function fail(lines) {
    console.error('✖ OSS attribution list is out of date:\n');
    for (const line of lines) console.error(`    ${line}`);
    console.error(`\n  Fix the ABOUT_LIBRARIES array in ${SETTINGS}.`);
    process.exit(1);
}

// --- parse ABOUT_LIBRARIES out of the TSX ------------------------------------
const source = readFileSync(SETTINGS, 'utf8');
const block = source.match(/const ABOUT_LIBRARIES[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!block) {
    console.error(`✖ could not find the ABOUT_LIBRARIES array in ${SETTINGS} — did it move or get renamed?`);
    process.exit(1);
}

const credited = [...block[1].matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*license:\s*'([^']+)'\s*\}/g)].map(
    ([, name, license]) => ({ name, license }),
);
if (credited.length === 0) {
    console.error(`✖ ABOUT_LIBRARIES parsed as empty in ${SETTINGS} — the entry shape probably changed.`);
    process.exit(1);
}

const problems = [];

// --- 1. every runtime dependency is credited ---------------------------------
const creditedPackages = new Set(credited.flatMap(({ name }) => ALIASES[name] ?? [name]));
const runtimeDeps = Object.keys(JSON.parse(readFileSync(PKG, 'utf8')).dependencies ?? {});

for (const dep of runtimeDeps) {
    if (creditedPackages.has(dep) || dep in EXEMPT) continue;
    problems.push(`missing: ${dep} is a runtime dependency but is not credited`);
}

// --- 2. every credited license matches what is installed ---------------------
for (const { name, license } of credited) {
    const packages = ALIASES[name] ?? [name];
    for (const pkg of packages) {
        let installed;
        try {
            installed = JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).license;
        } catch {
            problems.push(`unresolved: "${name}" points at ${pkg}, which is not installed`);
            continue;
        }
        if (installed !== license) {
            problems.push(`license: "${name}" says ${license}, but ${pkg} ships ${installed ?? '(none declared)'}`);
        }
    }
}

if (problems.length > 0) fail(problems);

console.log(
    `✔ OSS attribution OK — ${credited.length} libraries credited, licenses match, ${runtimeDeps.length} runtime deps covered`,
);
