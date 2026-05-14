const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * afterSign hook — electron-builder imzaladıktan sonra çalışır.
 * Tüm framework bileşenlerini entitlements.mac.plist ile yeniden imzalar.
 * macOS ARM64 üzerindeki EXC_BREAKPOINT / JIT crash'ını önler.
 */
exports.default = async function afterSign(context) {
    const { appOutDir, packager } = context;

    // Sadece macOS build'inde çalış
    if (packager.platform.name !== 'mac') {
        return;
    }

    const appName = packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);
    const entitlements = path.join(__dirname, 'build', 'entitlements.mac.plist');

    if (!fs.existsSync(entitlements)) {
        console.warn('[afterSign] entitlements.mac.plist bulunamadı, atlanıyor.');
        return;
    }

    console.log(`[afterSign] Yeniden imzalanıyor: ${appPath}`);

    // Önce tüm iç framework ve helper'ları imzala (içten dışa)
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
                console.log(`[afterSign] ✅ İmzalandı: ${inner}`);
            } catch (e) {
                console.warn(`[afterSign] ⚠️  Atlandı (${inner}): ${e.stderr ? e.stderr.toString() : e.message}`);
            }
        }
    }

    // En son ana .app'i imzala
    try {
        execSync(
            `codesign --force --options runtime --sign - --entitlements "${entitlements}" "${appPath}"`,
            { stdio: 'pipe' }
        );
        console.log(`[afterSign] ✅ Ana uygulama imzalandı.`);
    } catch (e) {
        console.error(`[afterSign] ❌ Ana uygulama imzalanamadı: ${e.stderr ? e.stderr.toString() : e.message}`);
        throw e;
    }
};
