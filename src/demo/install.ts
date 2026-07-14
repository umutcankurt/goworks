// Demo mode entry point — imported as the FIRST statement in src/main.tsx.
//
// Ordering matters: src/services/api.ts captures `window.ipcRenderer` at module
// scope (`const ipc = window.ipcRenderer`). If this module ran after App was
// imported, the Users/Dashboard/Reports screens would hold a reference to the
// real bridge and talk to the main process anyway.
//
// In a production build `import.meta.env.VITE_DEMO` is statically undefined, so
// the whole body below is dead code and Rollup drops it along with the fixtures.

import { buildDataset } from './data/build';
import { profileFor } from './data/profiles';
import { handlers } from './handlers';
import { DemoStore } from './store';

const LANG_KEY = 'goworks.lang';
const AUTH_KEY = 'auth_user';
/** Set by the app:setLocale handler right before it reloads for a language switch. */
const KEEP_AUTH_KEY = 'goworks.demo.keepAuth';

/** Simulated IPC round-trip, so loading states are visible but not tedious. */
const LATENCY_MS = 70;

function installDemoBridge(): void {
    // A language switch reloads the page to rebuild the fixture in the other
    // language. That reload must not look like a fresh start.
    const isLanguageSwitch = window.sessionStorage.getItem(KEEP_AUTH_KEY) === '1';
    window.sessionStorage.removeItem(KEEP_AUTH_KEY);

    const lang = isLanguageSwitch
        ? window.localStorage.getItem(LANG_KEY) ?? 'tr'
        : (import.meta.env.VITE_DEMO_LANG as string | undefined) ?? 'tr';

    window.localStorage.setItem(LANG_KEY, lang);

    // Every fresh start lands on the login screen — the "Sign in with Google"
    // button is the intended way into the prototype.
    if (!isLanguageSwitch) window.localStorage.removeItem(AUTH_KEY);

    const store = new DemoStore(buildDataset(profileFor(lang)));

    // `npm run demo:onboarding` — start as a brand-new install so the setup
    // wizard can be walked end to end with real, empty forms (create the vault,
    // upload a Service Account key, sign in). Without this the prototype starts
    // already configured and the wizard's steps short-circuit to "already done".
    if (import.meta.env.VITE_DEMO_ONBOARDING === '1' && !isLanguageSwitch) {
        store.data.config.onboardingCompletedAt = null;
        store.data.config.onboardingStep = 'welcome';
        store.data.config.termsAcceptedAt = null;
        store.data.config.termsVersion = null;
        store.data.config.googleClientId = '';
        store.data.oauth = { clientId: '', hasSecret: false };
        store.data.serviceAccount = { configured: false, email: null, clientId: null };
        store.vault = { ...store.vault, status: 'NEEDS_ONBOARDING' };
    }

    const bridge = {
        invoke(channel: string, ...args: unknown[]): Promise<any> {
            const handler = handlers[channel];
            if (!handler) {
                console.error(`[demo] no mock handler for channel "${channel}" — add one in src/demo/handlers.ts`);
                return Promise.reject(new Error(`[demo] unmocked IPC channel: ${channel}`));
            }
            return new Promise((resolve, reject) => {
                window.setTimeout(() => {
                    try {
                        resolve(handler(args[0], store));
                    } catch (error) {
                        reject(error);
                    }
                }, LATENCY_MS);
            });
        },
        on(channel: string, listener: (event: unknown, payload: any) => void) {
            store.on(channel, listener);
        },
        off(channel: string, listener: (event: unknown, payload: any) => void) {
            store.off(channel, listener);
        },
        send() {
            // log:write — the prototype has no main process to log to.
        },
    };

    Object.defineProperty(window, 'ipcRenderer', {
        value: bridge,
        configurable: true,
        writable: true,
    });

    (window as any).__demoStore = store;

    console.info(
        `%c[demo] prototype mode — ${store.data.profile.companyName} (${lang}). ` +
        'No Google, no SQLite, no vault. Reloading resets everything.',
        'color:#6366f1;font-weight:600',
    );
}

if (import.meta.env.VITE_DEMO === '1') {
    installDemoBridge();
}
