# Changelog

All notable changes to GoWorks are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on history.** GoWorks' earlier development history was squashed into the
> initial commit, so entries before v0.7.2 are summarized as that baseline. The
> version stayed at 0.7.2 throughout the pre-release preparation period, so
> **v0.7.3** bundles roughly six weeks of work that shipped in a single version
> bump. **v0.7.8 is the first public open-source release.**

## [Unreleased]

_No unreleased changes yet._

## [0.7.8] — 2026-07-13

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

[Unreleased]: https://github.com/umutcankurt/goworks/compare/v0.7.7...HEAD
[0.7.7]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.7
[0.7.6]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.6
[0.7.5]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.5
[0.7.4]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.4
[0.7.3]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.3
[0.7.2]: https://github.com/umutcankurt/goworks/releases/tag/v0.7.2
