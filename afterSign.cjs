const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * afterSign hook — runs after electron-builder has signed.
 * Re-signs all framework components with entitlements.mac.plist.
 * Prevents the EXC_BREAKPOINT / JIT crash on macOS ARM64.
 */
exports.default = async function afterSign(context) {
    const { appOutDir, packager } = context;

    // Only run on macOS builds
    if (packager.platform.name !== 'mac') {
        return;
    }

    const appName = packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);
    const entitlements = path.join(__dirname, 'build', 'entitlements.mac.plist');

    if (!fs.existsSync(entitlements)) {
        console.warn('[afterSign] entitlements.mac.plist not found, skipping.');
        return;
    }

    console.log(`[afterSign] Re-signing: ${appPath}`);

    // First sign all inner frameworks and helpers (inside out)
    const innerPaths = [
        `Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework`,
        `Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib`,
        `Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel`,
        `Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC`,
        `Contents/Frameworks/Mantle.framework/Versions/A/Mantle`,
        `Contents/Frameworks/${appName} Helper.app`,
        `Contents/Frameworks/${appName} Helper (GPU).app`,
        `Contents/Frameworks/${appName} Helper (Plugin).app`,
        `Contents/Frameworks/${appName} Helper (Renderer).app`,
    ];

    for (const inner of innerPaths) {
        const fullPath = path.join(appPath, inner);
        if (fs.existsSync(fullPath)) {
            try {
                execSync(
                    `codesign --force --options runtime --sign - --entitlements "${entitlements}" "${fullPath}"`,
                    { stdio: 'pipe' }
                );
                console.log(`[afterSign] ✅ Signed: ${inner}`);
            } catch (e) {
                console.warn(`[afterSign] ⚠️  Skipped (${inner}): ${e.stderr ? e.stderr.toString() : e.message}`);
            }
        }
    }

    // Finally sign the main .app
    try {
        execSync(
            `codesign --force --options runtime --sign - --entitlements "${entitlements}" "${appPath}"`,
            { stdio: 'pipe' }
        );
        console.log(`[afterSign] ✅ Main application signed.`);
    } catch (e) {
        console.error(`[afterSign] ❌ Main application could not be signed: ${e.stderr ? e.stderr.toString() : e.message}`);
        throw e;
    }
};
