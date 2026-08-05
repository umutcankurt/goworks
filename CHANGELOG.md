# Changelog

All notable changes to GoWorks are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on history.** GoWorks' earlier development history was squashed into the
> initial commit, so entries before v0.7.2 are summarized as that baseline. The
> version stayed at 0.7.2 throughout the pre-release preparation period, so
> **v0.7.3** bundles roughly six weeks of work that shipped in a single version
> bump. **v0.7.9 is the first public open-source release**; earlier builds were
> withdrawn (see below).

## [0.8.1] — 2026-08-05

A four-step dependency modernisation, ordered so that each step could only break
one thing and the next step started from a green baseline. The toolchain moves
forward substantially while the app itself stays put — the only behavioural
changes are two security fixes found alongside it: offboarding reset passwords
were coming from `Math.random()`, and log records could be forged through the
bulk-job path.

### Changed

- **Electron 40 → 43** (Chromium 150, Node 24.17, V8 15). Electron 40 had reached
  end-of-support. Startup is faster: the main process now boots from an embedded
  Node startup snapshot, and preload scripts are cached as compiled V8 bytecode.

- **Vite 5 → 8**, the rolldown-vite merge — Rolldown and Oxc replace Rollup and
  esbuild. Moved with `@vitejs/plugin-react` 4 → 6, `vite-plugin-electron`
  0.28 → 1.1 and `vite-plugin-electron-renderer` 0.14 → 1.0, because
  `@vitejs/plugin-react@6` pins `vite: ^8` and no release bridges the two.
  The main-process externals move from `build.rollupOptions` to
  `build.rolldownOptions`.

- **better-sqlite3 12 → 13**, which switches to N-API. This is the change with
  the widest reach: v13 ships a prebuilt binary for every target and its loader
  reads them directly, so one file now serves both Node and Electron. The
  per-ABI compile-and-swap machinery the project had carried since the SQLite
  migration is gone (see *Removed*), and `npm ci` drops from minutes to seconds.

- **i18next 23 → 26** and **react-i18next 14 → 17** (they share a hard peer
  range). The `<Trans>` serialisation fix in react-i18next 17 is a no-op here —
  every locale string uses named placeholders — and there is now a test that
  keeps it that way.

- **ESLint 8 → 9** with the config format moved from `.eslintrc.cjs` to
  `eslint.config.js`, plus `@typescript-eslint` 7 → 8,
  `eslint-plugin-react-hooks` 4 → 7 and `eslint-plugin-react-refresh` 0.4 → 0.5.
  The linted file set is unchanged and no rule was disabled to get there.
  react-hooks 7's `recommended` preset now enables 14 React Compiler rules by
  default; the two rules this project actually used are configured explicitly
  instead, so linting behaviour is identical.

- **jsdom 28 → 29**, **@testing-library/jest-dom 6 → 7**, **lucide-react 0.575 →
  1.27** and **react-dropzone 15 → 19**. No source changes were needed for the
  icons — 1.x keeps the old names as aliases. react-dropzone 19 does change one
  behaviour: dropping more files than `maxFiles` used to reject all of them and
  now accepts the ones within the limit.

- **Minimum Node.js is now 22.12** (was 20). Forced by Electron 43,
  better-sqlite3 13 and jest-dom 7; `.npmrc` sets `engine-strict=true`, so a
  lower version fails at install rather than at runtime.

- Installer size grew with Electron 43 and the bundled prebuilds — macOS
  126 MB → 135 MB, Windows 93 MB → 96 MB. The four Linux prebuilds are excluded
  from packaging since GoWorks targets macOS and Windows.

- `README.md` and `README.tr.md` now state the current toolchain — Electron 43,
  Vite 8 on Rolldown, better-sqlite3 13 on N-API — in both languages. Every
  version claim was checked against `package.json` rather than written from
  memory.

### Added

- `scripts/check-lucide-icons.mjs` (`npm run icons:check`, and part of
  `postlint`): asserts every lucide icon imported under `src/` exists in the
  installed package. A missing named export from an ESM barrel is not a build
  error — it resolves to `undefined` and only throws when that screen renders —
  so an icon rename could otherwise pass lint, type-check, tests and build, then
  break one page.

- A `<Trans>` regression test covering the five shapes the app uses, including
  the `defaults`-without-`i18nKey` form. The component had seven call sites and
  no test.

- `scripts/check-oss-attribution.mjs` (`npm run oss:check`, and part of
  `postlint`): asserts that every runtime dependency appears in Settings →
  About's open-source list and that each credited license matches what is
  actually installed. Neither kind of drift is visible to lint, types or tests —
  the list is a plain array that always renders.

### Fixed

- **Two shipped libraries were missing from the open-source attribution list**
  in Settings → About: `@noble/hashes` (the Argon2id implementation behind the
  master-password vault) and `clsx`. Both are credited now, and the check above
  keeps the list from drifting again.

- **A `useRef` call with no initial value** in `JobHistory.tsx` — the only
  argument-less one of the eight call sites in the codebase. React 19 drops that
  overload, so the call stops type-checking (`TS2554`) against React 19's types.
  The fix is safe on the current major rather than a forward-port that breaks the
  present: passing `undefined` explicitly resolves to React 18's own
  `useRef<T = undefined>(initialValue?: undefined)` overload, so the ref keeps
  its existing type and nothing about today's build changes.

### Security

- **Offboarding generated the departing user's reset password with
  `Math.random()`.** V8 implements it with xorshift128+, whose internal state is
  recoverable from a couple of observed outputs, so every password produced
  after that point was predictable — and this password is set on a live Google
  Workspace account. `changePasswordAtNextLogin` narrows the window without
  closing it: the first party to sign in sets the password and owns the account.
  Because the offboarding steps are individually toggleable, an operator who
  turns off "suspend" leaves this reset as the only line of defence. Passwords
  now come from `crypto.getRandomValues()` via a new
  `src/utils/generatePassword.ts`, with rejection sampling so the alphabet stays
  uniform (256 % 63 == 4, so a plain modulo would favour the first four
  symbols). The alphabet (63 ambiguity-free characters) and length (24, ~143
  bits) are unchanged. A `no-restricted-properties` ESLint rule is the
  regression guard — lint runs with `--max-warnings 0`, so it is a CI gate — and
  the two remaining non-secret `Math.random()` uses carry inline disables
  stating why.

- **Log records could be forged by anything that reached the logger.** `write()`
  appended formatted arguments to the log file with no sanitisation: no newline
  handling, no control-character escaping, no length cap. A newline inside any
  logged string produced a second, fully-formed `[timestamp] [LEVEL] …` record,
  which is enough to make the log worthless as evidence after an incident. That
  path is reachable: `validateJobPayload` is asymmetric — `BULK_SUSPEND` and
  `BULK_DELETE` go through `requireEmailList`, whose `EMAIL_RE` excludes
  whitespace, but `BULK_GROUP_ADD` and `BULK_SIGNATURE_PUSH` get `requireArray`
  alone, so raw CSV cell contents reach the log via the bulk workers and
  `retry.ts`. C0 control characters and DEL are now escaped per argument, and
  each argument is capped at 8 KB with an explicit truncation marker. The
  console stream is deliberately untouched — it is ephemeral developer output
  where readable multi-line stack traces are worth more than the
  one-record-per-line invariant. Adds `logger.test.ts`, the module's first test.
  Validating bulk-job row contents is left for later on purpose: the sanitiser
  closes the logging consequence, and content validation is a separate concern
  with its own risk of rejecting legitimate data.

- **A stale lockfile entry was still pinning a vulnerable `brace-expansion`.**
  Closes Dependabot alert #8 (GHSA-3jxr-9vmj-r5cp / CVE-2026-13149, high,
  development scope) — exponential-time expansion in `expand()`, where roughly
  90 bytes of input can stall a single-threaded consumer indefinitely. Nine of
  the ten copies in the tree were already patched by the upgrades above; the
  exception was a lockfile entry pinning 1.1.14 under `eslint-plugin-jsx-a11y`'s
  nested `minimatch@3.1.5`, which declares `brace-expansion: ^1.1.7` and had
  therefore accepted the patched release all along. Nothing was holding it back
  but the lockfile, so this is a lockfile-only change.

### Removed

- The better-sqlite3 dual-ABI apparatus, now that one binary serves both
  runtimes: `scripts/sqlite-binary.mjs`, `scripts/check-native-abi.mjs`, the
  `predev` / `pretest` / `posttest` / `postinstall` / `test:prepare` / `rebuild`
  / `postbuild` hooks, and CI's native-binary preparation step. Running tests is
  now just `npx vitest run`.

  These had stopped protecting anything: v13's loader ignores the path they
  operated on, so they reported success while doing nothing.

- The magic-byte architecture sniff in the startup check. Per-target prebuilds
  are selected by platform and architecture, so a foreign binary is unreachable,
  and an N-API binary is not tied to an ABI version. The load probe remains — a
  missing or corrupt prebuild is the only failure left, and only the probe sees
  it.

- `@types/react-dropzone`, a deprecated stub; react-dropzone has shipped its own
  types since v11.

## [0.8.0] — 2026-07-20

Closes a static-analysis pass over the whole codebase, plus two bugs found while
verifying the fixes — one of which had been silently destroying the Google session
on every app close since long before the security work began.

### Fixed

- **Quitting the app deleted the stored Google session.** `before-quit` and, on macOS,
  `window-all-closed` both called `logout()`, which deletes the refresh token from the
  vault. Every close therefore forced a full browser OAuth round on the next launch,
  defeating the point of storing the token encrypted at rest. A full logout now happens
  only where it was always documented to: an explicit user logout or a factory reset.

- **Unlocking the vault dropped you back at the Google sign-in screen.** The renderer
  kept the only copy of the signed-in identity in `localStorage`, and cleared it
  whenever `auth:check` reported `authenticated: false`. A vault lock reports exactly
  that — locking drops the in-memory OAuth credentials on purpose while the grant stays
  in the vault — so the lock erased the identity and the unlocked app found nothing to
  restore, landing on `/login` over a fully authenticated main process. The main process
  is now the authority: `auth:check` returns the profile, and the renderer's copy is a
  cache cleared only on a real logout. It still covers one gap — a silent restore fails
  open when Google's userinfo endpoint is unreachable, and the cached copy carries the
  identity through.

- **The signature preview did not match what Gmail received.** `SignaturePreview`
  carried its own substitution engine that never sanitised and resolved conditional
  blocks in the opposite order from the real renderer. Most visibly, the manual
  signature editor substituted `{{ad_soyad}}` into a value while Save pushed the buffer
  through the raw path, which substitutes nothing. Preview now runs through the same
  main-process engine as the push, via a new `templates:renderPreview` IPC channel that
  mirrors both push modes explicitly.

### Security

- **IPC errors no longer leak filesystem paths.** 26 handlers under `config:*`,
  `media:*` and `jobs:*` returned `error.message` verbatim to the renderer, so a failed
  disk operation shipped its absolute path — `ENOENT: … open '/Users/…/vault.enc'` —
  into a toast, in production as well as development. Beyond the disclosure this was a
  file-existence oracle: code running in a compromised renderer could call these
  channels and tell `ENOENT` from `EACCES` to probe the filesystem. They now log the
  full stack to the log file and return a generic message. Validation rules that the
  operator can actually act on (invalid domain, name too long, unsupported logo format)
  are preserved as `UserFacingError`, and an expired Google session now says so instead
  of "an unexpected error occurred".

- **A long manual lock now requires Google re-authorization.** Locking with the lock
  button arms a 59-minute window; unlocking after it expires opens the vault with the
  master password but does not silently restore the Google session. This bounds how long
  a deliberately locked machine keeps working Google access if the master password is
  obtained. The idle auto-lock is exempt — its own default is 60 minutes, so a shorter
  window would expire the instant it fired — and closing the app does not arm it, since
  closing is not locking.

- Preview media tokens are resolved in the main process from the template's own assets
  and applied last, so a value supplied by the renderer can no longer reach an `<img>`
  source in a rendered signature.

### Changed

- `templates:renderPreview` is new. `templates:preview` is unchanged and still renders a
  saved template by id.
- Installers no longer carry third-party documentation. Beyond the size saving, this is
  what let the build's secret guard pass: dotenv's README demonstrates multiline env
  vars with a `-----BEGIN RSA PRIVATE KEY-----` block, and the guard cannot distinguish
  a documented example from a real leak — so the docs go, rather than the check.
- Test coverage grew from 404 to 447. New suites cover the lock/unlock identity
  round-trip, the manual-lock window, the preview component's debounce and
  out-of-order-response handling, and the raw/template render distinction — each of them
  a bug that had already shipped once.

## [0.7.9] — 2026-07-14

### Security

- **Installers could ship a build-time OAuth credential; they no longer can.** Up to
  v0.7.8, a build could pack a *stale* compiled chunk from an older generation of
  `auth-service` that had the OAuth client ID and secret baked in as string literals.
  The mechanism: `dotenv` loaded `.env` into `process.env` at build time and the bundler
  folded those reads into literals — and because `dist-electron/` was never cleaned
  between builds, such a chunk could outlive the source change that removed it and end
  up inside `app.asar`. **The source tree never contained a secret**; only the compiled
  artifact did. Two changes close this off:
  - `prebuild` now wipes `dist/` and `dist-electron/` before every build, so no artifact
    can outlive its generation.
  - A new gate, `scripts/check-bundle-secrets.mjs`, scans the compiled output for
    credential-shaped strings (OAuth secrets, client IDs, API keys, private-key blocks)
    and fails the build *before* `electron-builder` packs an asar. Standalone:
    `npm run secrets:check`.

  Installers for v0.7.2–v0.7.8 have been withdrawn. **v0.7.9 is the first build verified
  by the new gate.** If you built GoWorks yourself from an earlier tag with a populated
  `.env`, treat that credential as exposed and rotate it.

### Changed

- The local database drops an orphaned `googleApiKey` row (migration v3 → v4). It came
  from an abandoned Google Picker design and was hand-written into some installs, but no
  code path ever read it — it is not part of the app config schema.
- The README now states plainly that GoWorks was built with AI assistance, and asks you
  to run your own review before pointing it at a production tenant.

## [0.7.8] — 2026-07-14

### Added
- **Demo mode.** A fully clickable prototype that needs no Google account, no Service
  Account, no master password, and no internet — everything is served from an in-memory
  fixture against a fictional tenant (`npm run demo` / `demo:en`, plus `demo:onboarding`
  variants for the setup wizard). Only the data layer is replaced: the prototype renders
  the real production components, so there is no duplicate UI to maintain. A coverage
  check (`npm run demo:check`, run automatically after `npm run lint`) fails if an IPC
  channel gains no demo handler. Nothing demo-related ships in a production build.
  See [`docs/DEMO_MODE.md`](docs/DEMO_MODE.md).
- **Screenshots in the README.** Twelve screens in both English and Turkish, captured in
  demo mode so they contain no real customer data.

### Fixed
- **Percent sign was placed the Turkish way in the English UI** (`%40` instead of `40%`).
  A new `useLocaleFormat().formatPercent()` defers to `Intl`, so the sign lands before the
  number in Turkish and after it in English. Applied to the dashboard storage widget, the
  bulk-operation progress bar, and the signature audit.
- **Non-Turkish phone numbers were mangled by the Turkish input mask** — `+1 555 010 0101`
  became `90 155 501 00 10`. Numbers written with a country code other than `+90` are now
  left exactly as entered, while `+90` still snaps into the domestic format. The English
  phone placeholders no longer show a Turkish-format example.
- **Signature preview on the New User screen showed a broken image** for any template
  containing one: the preview renders the template client-side and now resolves the
  template's media tokens (`{{image_N}}`) itself.

### Security
- **Dependency security patch.** `sanitize-html` 2.17.3 → 2.17.6 (fixes a critical
  stored-XSS via `xmp` raw-text passthrough, GHSA-rpr9-rxv7-x643, in the library that
  sanitizes Gmail-signature HTML), `react-router` 7.13 → 7.18, plus
  `minimatch`/`postcss`/`qs`/`brace-expansion`. Production dependencies now report
  zero known vulnerabilities.
- **Explicit inline-CSS allowlist for signature HTML.** `sanitizeTemplateHtml` now
  defines an `allowedStyles` allowlist that keeps legitimate presentational CSS
  (colors, fonts, box-model, borders) while stripping injection vectors such as
  `url()`, `expression()`, and positioning.
- **Hardened Content-Security-Policy.** Added `base-uri 'self'`, `object-src 'none'`,
  and `frame-ancestors 'none'` to both the development and production CSP.
- **No secret can be baked into the build.** Removed the dead build-time `dotenv`
  load from the Vite config; OAuth credentials are only ever read from `app_config`
  at runtime, so shipped artifacts contain no embedded secret.

## [0.7.7] — 2026-06-26

### Fixed
- **oneClick uninstaller now actually shows the data-deletion confirmation.** On
  Windows the NSIS `oneClick` template switches to silent mode after the first
  dialog, which suppressed the custom "also delete your data?" prompt; the macro is
  now shown before silent mode takes effect.

## [0.7.6] — 2026-06-26

### Added
- **Windows uninstall data-deletion prompt.** The NSIS uninstaller now asks whether
  to also remove local data (`%APPDATA%\GoWorks`); the default is to keep it.

### Security
- **Factory Reset upgraded to a full secure wipe.** `vault.enc` is now securely
  deleted (overwrite-then-unlink), all tables are emptied and reclaimed with
  `VACUUM` + `wal_checkpoint(TRUNCATE)` to clear free-page/WAL residue, and logs +
  `crash.log` are removed.

## [0.7.5] — 2026-06-26

### Added
- **Re-authentication screen.** When the stored Google session can no longer be
  refreshed silently, a dedicated re-auth screen guides the user back through
  sign-in instead of failing with a raw token error.

### Fixed
- **Stale OAuth client after unlock.** Fixed a "silent session" error where, after
  unlocking the vault, `AdminService` held a stale OAuth2 client reference.

## [0.7.4] — 2026-06-26

### Changed
- **Loopback OAuth callback now binds to an ephemeral port** instead of a fixed
  port 3000, avoiding conflicts when the port is already in use.

### Removed
- **Auto-update artifacts** (`latest*.yml`, `*.blockmap`) are no longer produced;
  new versions are distributed manually.

## [0.7.3] — 2026-06-24

The first feature release after open-sourcing; bundles the master-password vault
and the Gmail signature / onboarding / factory-reset work developed during the
public-preparation period.

### Added
- **Master-password vault** — a zero-trust vault (Argon2id KDF + AES-256-GCM
  KEK/DEK) that encrypts the truly sensitive secrets (Service Account key and Google
  refresh token) at rest in `vault.enc`. Includes configurable idle auto-lock,
  in-app password change (re-wraps the DEK without re-upload/re-login), a graceful
  lock that lets running jobs finish, brute-force lockout with exponential back-off,
  and one-time migration from the legacy `safeStorage` storage.
- **Gmail signature editor overhaul** — a formatting toolbar, starter-template
  gallery, direct image upload to Drive (`drive.file` scope) with an automatic media
  token system (`{{image_N}}`), and image insertion at the cursor position.
- **Bulk group-add** — add members to a Google Group in bulk from a CSV file
  (`BULK_GROUP_ADD` job type).
- **Terms & liability disclaimer gate** — a versioned, locale-aware acceptance
  screen shown during onboarding and re-prompted when the terms change.
- **Factory reset** from Settings, behind a type-to-confirm guard.
- **Onboarding improvements** — drag-and-drop Service Account upload, an OAuth
  consent-screen step, a "Required Google APIs" card with dynamic API/scope counts,
  and a live branding preview.

### Changed
- **Settings redesigned** into a five-tab layout with an About tab.
- Renamed the "Reports" area to "Statistics" (TR + EN).
- Translated all in-code comments to English (open-source preparation).

### Security
- **Electron hardening** — explicit `webPreferences` and a dynamic Content Security
  Policy.
- **IPC preload bridge restricted** to an explicit channel allowlist.

### Fixed
- **arm64 macOS SIGKILL** during the better-sqlite3 native-binary ABI swap — the
  swap now uses an atomic rename.

### Performance
- Removed an N+1 query in the signature audit and made cache writes synchronous.

## [0.7.2] — 2026-05-14

Initial public (open-source) release under Apache 2.0. Baseline feature set at the
time of open-sourcing:

### Added
- Google Workspace user lifecycle management: search / view / edit users, suspend /
  delete / restore accounts, aliases, and email forwarding.
- Offboarding wizard for safely deprovisioning departing employees.
- CSV-driven bulk operations (suspend / delete / signature-push) with a guided
  wizard, cancellable jobs, rate limiting, retry, and live progress.
- Google Groups management (Directory API + Groups Settings API): full CRUD for
  groups, members, roles, aliases, and access settings.
- Gmail signature templating with a signature-audit (drift-detection) flow.
- Onboarding wizard for first-run setup (branding, Google Cloud project, Service
  Account, Domain-Wide Delegation).
- Dynamic multi-tenant branding stored in local config — nothing about any customer
  is hardcoded.
- Fully local architecture: a better-sqlite3 database and an in-process,
  crash-safe SQLite-backed job queue (the previous Fastify + PostgreSQL + Redis +
  BullMQ + Docker server was removed entirely).
- Bilingual (English + Turkish) interface, switchable at runtime.
- Boot-time config validation, file-writing logger with rotation, and a
  better-sqlite3 ABI parity guard.

[Unreleased]: https://github.com/umutcankurt/goworks/compare/v0.8.1...HEAD
[0.8.1]: https://github.com/umutcankurt/goworks/releases/tag/v0.8.1
[0.8.0]: https://github.com/umutcankurt/goworks/releases/tag/v0.8.0
[0.7.9]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.9
[0.7.8]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.8
[0.7.7]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.7
[0.7.6]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.6
[0.7.5]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.5
[0.7.4]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.4
[0.7.3]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.3
[0.7.2]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.2
