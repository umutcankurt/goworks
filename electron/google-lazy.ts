import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

// Lazy-load googleapis so V8 JIT compilation is deferred until after
// app.whenReady(), preventing EXC_BREAKPOINT crashes on macOS at startup.
export function getGoogle(): typeof import('googleapis').google {
    return (_require('googleapis') as typeof import('googleapis')).google;
}
