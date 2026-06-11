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

We aim to acknowledge a report within a few days and to provide a remediation
timeline after triage. We will credit reporters who wish to be named once a fix
is released.

## Scope

Especially relevant areas:

- **Credential storage** — OAuth tokens and the Service Account key are
  encrypted at rest via Electron `safeStorage` (Keychain on macOS, DPAPI on
  Windows). Issues that could expose these in plaintext are in scope.
- **OAuth / authentication flow** — domain and admin-role verification, the
  loopback OAuth flow, and idle auto-logout.
- **IPC surface** — the `electron/preload.ts` context bridge and the
  `ipcMain.handle` channels in `electron/main.ts`.
- **Process isolation** — context isolation, external-link handling, and any
  path that could enable remote code execution in the renderer.

Out of scope: vulnerabilities in your own Google Cloud configuration,
misconfigured OAuth consent screens, or issues that require an already-
compromised local machine.

## Handling Credentials (for users)

- Never commit your `.env` or `service-account.json` — both are git-ignored by
  default.
- Service Account keys grant domain-wide delegation; treat them like
  passwords and rotate them if you suspect exposure.
- GoWorks stores secrets in your OS user-data directory; protect that account
  accordingly.
