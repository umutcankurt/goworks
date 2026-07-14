# Demo Mode

A fully clickable prototype of GoWorks that needs **no Google Workspace account, no
Service Account, no master password, and no internet**. Everything is served from an
in-memory fixture.

```bash
npm run demo               # Turkish tenant   — "ABC Şirketi"  (abcsirketi.com)
npm run demo:en            # English tenant   — "ACME Inc."    (acme-inc.com)

npm run demo:onboarding    # same, but as a brand-new install (setup wizard from step 1)
npm run demo:onboarding:en
```

The app opens on the login screen. **"Sign in with Google" is cosmetic** — it opens no
browser and talks to no OAuth endpoint; it drops you straight onto the dashboard as a
demo administrator.

Use it to:

- capture documentation screenshots without exposing real people,
- demo the product to someone who has no tenant to point it at,
- develop and review UI without touching production data.

## What it is (and is not)

Demo mode replaces exactly one thing: **the data layer**.

The renderer's only door to the main process is `window.ipcRenderer`, exposed by
`electron/preload.ts`. In demo mode the preload does not expose it, and
`src/demo/install.ts` defines an in-memory bridge in its place. Nothing else changes.

```
                    normal                          demo
React components    the real ones          →        the same real ones
window.ipcRenderer  contextBridge → main   →        src/demo/handlers.ts
data                Google API + SQLite    →        src/demo/data/build.ts (RAM)
```

Consequences worth internalising:

- **The real data is never opened.** No `goworks.db`, no `vault.enc`, no
  `dashboard-cache.json`, no Google request. You do not need to back anything up before
  running the demo.
- **There is no duplicate UI to maintain.** The prototype renders the production
  components. A redesign, a new field, a new page — the demo picks it up for free.
- **Drift is therefore only ever in the IPC contract**: a new channel, or a changed
  request/response shape. That is what `npm run demo:check` guards (see below).

## Nothing persists

The store lives in RAM only. Create a user, delete a group, rename the company, run a
bulk job — it all works, and it is **all gone on reload**. Restarting (or just pressing
⌘R) rebuilds the fixture from scratch.

That is deliberate: every screenshot run starts from an identical state, and a
misclick cannot corrupt the set. There is no "reset demo data" button because reloading
*is* the reset.

The only things written to `localStorage` are the keys the app itself owns:
`auth_user`, `goworks.lang`, `goworks.theme`. A fresh start clears `auth_user`, which
is why you always land on the login screen.

## Everything is clickable

The mock is a small state machine, not a table of constants:

| You do | The prototype does |
| --- | --- |
| Sign in | Returns the demo admin instantly — no browser, no OAuth |
| Create / suspend / delete a user | Mutates the store; the list and counters update |
| Add or remove a group member, add an alias | Applied and reflected everywhere |
| Change company name, abbreviation, logo (Settings → General) | Header and sidebar update live |
| Start a bulk job or a signature audit | Fake `jobs:progress` events stream in, then `jobs:done`; the job lands in Job History |
| Click the lock icon in the header | Vault lock screen appears — **any password unlocks it** |
| Settings → "Restart the wizard" | The 9-step onboarding wizard runs, then returns you to the app |
| Switch language (TR ⇄ EN) | Reloads and rebuilds the fixture in the other language (in-session changes are lost — see above) |

### Demoing the setup wizard

The normal prototype starts already configured, so the wizard's steps short-circuit to
"already done". `npm run demo:onboarding` starts it as a brand-new install instead —
no vault, no Service Account, no OAuth credentials — so the nine setup steps can be
walked end to end with real, empty forms. The Service Account step wants a JSON file;
any file works, the contents are not parsed.

Inside a running prototype, Settings → General → "Restart the wizard" does the same
thing (unlike the real app, it also resets the vault, so the master-password step is
demoable).

## Keeping it in sync — the contract

**`electron/preload.ts`'s `invokeChannels` array is the source of truth.** Every channel
in it must have a handler in `src/demo/handlers.ts`, or the screen that calls it renders
blank in demo mode.

```bash
npm run demo:check     # also runs automatically after `npm run lint`
```

The rules:

1. **New IPC channel in the real app → add a handler in the same PR.** `demo:check`
   fails until you do, and tells you exactly which channels are missing. Add a fixture
   in `src/demo/data/build.ts` if the channel needs data behind it.
2. **Changed request/response shape → update the handler and the fixture.** `tsc` catches
   most of this, because the fixtures are typed against the same DTOs the app uses
   (`src/types/admin.d.ts`, `src/services/server-api.ts`).
3. **UI or design change → do nothing.** The demo renders the real components.

### Response shapes — the one real trap

The renderer has two API layers with *different* envelope conventions. Getting this
wrong yields a blank screen rather than an error:

| Layer | Channels | Handler must return |
| --- | --- | --- |
| `src/services/api.ts` (no unwrapping) | `admin:*`, `dashboard:*`, `auth:*` | the raw envelope: `{ success: true, users: [...] }` |
| `src/services/server-api.ts` → `ipcInvoke()` (unwraps `data`) | everything else | `{ success: true, data: ... }` |
| direct `invoke`, no envelope | `config:getBootStatus`, `app:*` | the bare value |

Beyond that, a handful of fixture values are load-bearing and must not drift:

- `autoLockMinutes: '0'` — otherwise the idle timer locks the vault mid-session.
- `termsVersion: '1'` — must equal `CURRENT_TERMS_VERSION` (`src/lib/legal.ts`), or a
  full-screen terms modal covers every page.
- `onboardingCompletedAt` — non-null, or every route redirects to the wizard.
- `serviceAccount.configured: true` — or the signature screens fall back to a warning.
- `jobs:progress` / `jobs:done` must actually be emitted, or the bulk and audit screens
  sit at 0% forever.

## Layout

```
src/demo/
  install.ts        entry point — swaps window.ipcRenderer, seeds localStorage
  handlers.ts       one entry per IPC channel
  store.ts          mutable in-memory state + the event bus + the fake job runner
  media.ts          logos and signature images, all as data: URIs (must work offline)
  data/
    profiles.ts     the only strings that differ between TR and EN
    build.ts        generates the full dataset from a profile
scripts/
  check-demo-coverage.mjs    the drift guard
```

`src/demo/data/build.ts` generates both tenants from the same code, so the Turkish and
English datasets are structurally identical: the same 64 users, the same seven suspended,
the same group membership. The two screenshot sets line up frame for frame.

Names, domains, phone numbers and IPs are all fictional. Phone numbers come from ranges
reserved for fiction (`+1 555-01xx`, Ofcom's `+44 20 7946 0xxx`); login-activity IPs come
from RFC 5737's documentation block `203.0.113.0/24`.

## Production safety

`import.meta.env.VITE_DEMO` is statically `undefined` in a production build, so the body
of `install.ts` is dead code and Rollup drops it together with the fixtures. The preload
guard reads `process.env.VITE_DEMO`, which is only ever set by the `demo` npm scripts.
No demo artefact ships in a release.
