# Security Policy

GoWorks is a local-first desktop application: it ships no API keys, runs no
backend, collects no telemetry, and keeps all data (the SQLite database, OAuth
tokens, and the Service Account key) on the user's own machine. You bring your
own Google Cloud project and credentials. This shapes what a vulnerability in
GoWorks can — and cannot — affect.

## Supported Versions

GoWorks is distributed as a desktop app without auto-update; users install a
specific build. Security fixes land on the latest release. Always run the most
recent version from the [Releases](https://github.com/umutcankurt/goworks/releases)
page.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/umutcankurt/goworks/security/advisories/new)
(Security → Advisories → "Report a vulnerability"). If you cannot use that
channel, open a minimal public issue asking for a private contact — without any
exploit details — and we will follow up.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The GoWorks version and your OS (macOS / Windows / Linux).

## Scope

Especially relevant areas:

- **Credential storage** — the sensitive secrets (the Service Account key and
  the OAuth refresh token) are encrypted at rest in a master-password vault
  (`vault.enc`): an Argon2id-derived key-encryption key wrapping an AES-256-GCM
  data-encryption key (KEK/DEK). The OAuth Client ID/Secret are plain config
  (a desktop app is a "public client"), and the access token lives in memory
  only. Electron `safeStorage` is retired and read only once to migrate older
  installs. Issues that could expose vault contents in plaintext are in scope.
- **OAuth / authentication flow** — domain and admin-role verification, the
  loopback OAuth flow, idle auto-lock and the vault unlock/session-restore path,
  and the brute-force lockout (exponential back-off on repeated wrong unlocks).
- **IPC surface** — the `electron/preload.ts` context bridge and the
  `ipcMain.handle` channels in `electron/main.ts`.
- **Process isolation** — context isolation, external-link handling, and any
  path that could enable remote code execution in the renderer.

Out of scope: vulnerabilities in your own Google Cloud configuration,
misconfigured OAuth consent screens, or issues that require an already-
compromised local machine.

## Handling Credentials (for users)

- Never commit your `.env` — it is git-ignored by default.
- Service Account keys grant domain-wide delegation; treat them like
  passwords and rotate them if you suspect exposure.
- Choose a strong master password and keep it safe — it is the only key to the
  vault. **There is no recovery if you forget it**: the only path forward is
  resetting the vault, which wipes the stored Service Account key and Google
  session (you then re-upload the key and sign in again).
- GoWorks stores the encrypted vault in your OS user-data directory; protect
  that account accordingly.

## Data Location & Disposal

All GoWorks data lives under your OS user-data directory —
`%APPDATA%\GoWorks` on Windows, `~/Library/Application Support/GoWorks` on
macOS:

- `vault.enc` — the encrypted Service Account key and Google refresh token.
- `goworks.db` — branding, institutions, signature templates, and the
  plain-config OAuth client secret.
- `logs/` and `crash.log` — operational logs that may contain email addresses.

When you retire or repurpose a machine, remove this data deliberately:

- **Windows** — the uninstaller offers to delete the data directory (opt-in;
  the default is to keep it).
- **macOS / Linux** — there is no uninstall hook, so run **Settings → Factory
  Reset** *before* removing the app.

**Factory Reset performs a secure wipe**, not a plain delete: `vault.enc` is
overwritten before being unlinked, the database is emptied and reclaimed with
`VACUUM` + `wal_checkpoint(TRUNCATE)` so no free-page or WAL residue remains, and
logs (including `crash.log`) are removed. Simply uninstalling the app on macOS
without a Factory Reset leaves the encrypted vault and database on disk.
