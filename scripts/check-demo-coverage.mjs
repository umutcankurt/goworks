#!/usr/bin/env node
// Demo-mode drift guard.
//
// electron/preload.ts holds the authoritative list of IPC channels the renderer
// may call. src/demo/handlers.ts must answer every one of them, or the demo
// prototype shows a blank screen on the page that calls the missing channel.
//
// This is the mechanism that turns "keep the mock in sync" into a checklist
// instead of a hunt: add a channel to the real app, this fails, you know what
// to write. Runs as `npm run demo:check` and automatically after `npm run lint`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const preload = readFileSync(join(root, 'electron/preload.ts'), 'utf8');
const handlersSrc = readFileSync(join(root, 'src/demo/handlers.ts'), 'utf8');

function parseChannelArray(source, name) {
    const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`));
    if (!match) {
        console.error(`✖ could not find "${name}" in electron/preload.ts`);
        process.exit(1);
    }
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const invokeChannels = parseChannelArray(preload, 'invokeChannels');

// Handler keys look like:  'admin:getUsers': (args, store) => ...
const mocked = new Set(
    [...handlersSrc.matchAll(/'([a-zA-Z]+:[a-zA-Z]+)'\s*:/g)].map((m) => m[1]),
);

const missing = invokeChannels.filter((c) => !mocked.has(c));
const extra = [...mocked].filter((c) => !invokeChannels.includes(c));

if (extra.length) {
    console.warn(
        `⚠ ${extra.length} demo handler(s) answer channels the app no longer exposes:\n` +
        extra.map((c) => `    ${c}`).join('\n') +
        '\n  (harmless, but they can be deleted from src/demo/handlers.ts)\n',
    );
}

if (missing.length) {
    console.error(
        `✖ demo mode is out of sync — ${missing.length} IPC channel(s) have no mock handler:\n` +
        missing.map((c) => `    ${c}`).join('\n') +
        '\n\n  Add each one to src/demo/handlers.ts (and a fixture in src/demo/data/build.ts\n' +
        '  if it needs data). See docs/DEMO_MODE.md.\n',
    );
    process.exit(1);
}

console.log(`✔ demo mode covers all ${invokeChannels.length} IPC channels`);
