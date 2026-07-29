#!/usr/bin/env node
/**
 * Fails if any icon `src/` imports from lucide-react no longer exists.
 *
 * A missing named export from an ESM barrel is not a build error — it resolves
 * to `undefined`, and React only throws when that particular screen renders. So
 * a lucide major that renames an icon ships green through lint, tsc, the test
 * suite and `vite build`, then crashes one page in production.
 *
 * lucide does rename icons across majors (0.x -> 1.x turned `AlertCircle` into
 * an alias for `CircleAlert`, and the deprecated names are kept only by
 * convention). This check makes the next bump prove itself instead.
 *
 * Type-only imports are collected separately and not resolved: `LucideIcon` has
 * no runtime value, and `tsc --noEmit` already covers it.
 *
 * Cost: ~150ms, most of it importing the barrel.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const IMPORT_RE = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]lucide-react['"]/gs;

/** @type {Set<string>} */ const valueImports = new Set();
/** @type {Set<string>} */ const typeImports = new Set();

function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            walk(path);
            continue;
        }
        if (!/\.tsx?$/.test(path)) continue;

        const source = readFileSync(path, 'utf8');
        let match;
        while ((match = IMPORT_RE.exec(source))) {
            const isTypeImport = Boolean(match[1]);
            for (const specifier of match[2].split(',')) {
                const raw = specifier.trim();
                if (!raw) continue;
                // `Image as ImageIcon` -> Image; `type LucideIcon` -> LucideIcon
                const inlineType = /^type\s+/.test(raw);
                const name = raw.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
                if (name) (isTypeImport || inlineType ? typeImports : valueImports).add(name);
            }
        }
    }
}

walk(SRC);

if (valueImports.size === 0) {
    console.error('✖ no lucide-react imports found under src/ — is this script pointed at the right tree?');
    process.exit(1);
}

const lucide = await import('lucide-react');
const { version } = JSON.parse(readFileSync('node_modules/lucide-react/package.json', 'utf8'));
const missing = [...valueImports].filter((name) => !(name in lucide)).sort();

if (missing.length > 0) {
    console.error(`✖ ${missing.length} icon(s) imported by src/ do not exist in lucide-react@${version}:\n`);
    for (const name of missing) console.error(`    ${name}`);
    console.error('\n  Check the lucide changelog for the new name, then update the import sites.');
    process.exit(1);
}

const typeNote = typeImports.size > 0 ? `, ${typeImports.size} type-only` : '';
console.log(`✔ all ${valueImports.size} lucide icons resolve in lucide-react@${version}${typeNote}`);
