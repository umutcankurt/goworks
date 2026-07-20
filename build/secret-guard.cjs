/**
 * electron-builder hooks that make the bundle secret scan unbypassable.
 *
 * `npm run build` already runs scripts/check-bundle-secrets.mjs, but nothing
 * bound that gate to packaging: `npx electron-builder -mw` run directly — the
 * natural thing to do after a failed sign, or to produce a second platform —
 * skipped it entirely. And even when it did run, it only ever proved that
 * dist/ and dist-electron/ were clean. It never looked at what was actually
 * packed: the production node_modules electron-builder pulls in implicitly, the
 * asarUnpack paths, or extraResources.
 *
 * beforePack re-runs the input scan as part of packaging itself.
 * afterPack scans the produced app.asar, which is the artifact that ships.
 *
 * This is the control standing between this project and a repeat of the
 * v0.7.2–v0.7.7 incident, where a real OAuth client secret reached six
 * released installers through a stale dist-electron/ chunk.
 */
const path = require('node:path');
const fs = require('node:fs');

async function loadScanner() {
    // The scanner is ESM; electron-builder hooks are CJS.
    return import(
        require('node:url').pathToFileURL(
            path.join(__dirname, '..', 'scripts', 'check-bundle-secrets.mjs'),
        ).href
    );
}

exports.beforePack = async function beforePack() {
    const { scanBuildOutput, reportAndExit } = await loadScanner();
    const { findings, scanned } = scanBuildOutput();
    reportAndExit(findings, scanned, 'build inputs (beforePack)');
};

/** Locate app.asar under the packaged output, whatever the platform layout is. */
function findAsar(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const hit = findAsar(full);
            if (hit) return hit;
        } else if (entry.name === 'app.asar') {
            return full;
        }
    }
    return null;
}

exports.afterPack = async function afterPack(context) {
    const { scanFile, reportAndExit } = await loadScanner();
    const asar = findAsar(context.appOutDir);
    if (!asar) {
        // Not fatal: an asar-disabled build is a legitimate configuration, and
        // beforePack already covered the inputs. Say so rather than pass silently.
        console.warn('[secret-guard] app.asar not found under', context.appOutDir, '— skipping archive scan.');
        return;
    }
    const findings = scanFile(asar);
    reportAndExit(findings, 1, `packed archive (${path.basename(asar)})`);
};
