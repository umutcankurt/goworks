<div align="center">

<img src="build/icon.png" alt="GoWorks logo" width="120" height="120" />

# GoWorks

**Open-source desktop app for Google Workspace™ administration — bulk user lifecycle management, offboarding, Gmail signature deployment, and group management.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-lightgrey.svg)]()
[![Built with Electron](https://img.shields.io/badge/Electron-40-47848F.svg?logo=electron&logoColor=white)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)]()
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

**English** · [Türkçe](README.tr.md)

</div>

---

**GoWorks** is a cross-platform desktop application that gives Google Workspace administrators a fast, focused UI for the day-to-day work that the Google Admin Console makes slow: onboarding and offboarding employees, bulk-suspending or deleting accounts from a CSV, deploying standardized Gmail signatures across the organization, managing groups, and auditing user activity.

It runs **entirely on your machine** — a local SQLite database and an in-process job queue. There is no server to host, no Docker, no external database. You connect it to your own Google Cloud project, and your data never leaves your computer.

## Table of Contents

- [Features](#features)
- [Why GoWorks](#why-goworks)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Building Installers](#building-installers)
- [Architecture](#architecture)
- [OAuth Scopes](#oauth-scopes)
- [Security & Privacy](#security--privacy)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

## Features

- **🔐 Secure Google OAuth2 sign-in** — loopback OAuth flow with domain and admin-role verification. Only Workspace admins from your configured domain can sign in.
- **👥 User management** — search, view, and edit user profiles and group memberships; suspend, delete, and restore accounts; manage aliases and email forwarding.
- **📦 Bulk operations** — drive suspend / delete / signature-push jobs from a CSV file, with a guided wizard, cancellable jobs, rate limiting, automatic retry on transient errors, and live progress.
- **🚪 Offboarding wizard** — a guided multi-step flow to safely deprovision a departing employee: suspend, set email forwarding, remove from groups, and more.
- **🧭 Onboarding wizard** — first-run setup that walks you through company branding, the Google Cloud project, the Service Account, and Domain-Wide Delegation.
- **✍️ Gmail signature management** — a WYSIWYG HTML template editor with reusable tokens, media management, and background signature deployment across the domain via a Service Account.
- **🔎 Signature audit** — scan the organization for signature drift, then review and apply fixes.
- **👨‍👩‍👧 Google Groups management** — full CRUD for groups, members, roles, aliases, and access settings (Directory API + Groups Settings API).
- **📊 Dashboard & reports** — active job tracking, Google Admin audit log, and Workspace storage/usage reports.
- **🗂️ Persistent local store** — templates, job titles, institutions, app config, and full job history in a local SQLite database, with crash-safe job resumption.
- **🎨 Dynamic branding** — company name, sidebar abbreviation, logo, email sender name, and allowed login domain are all configurable in-app. GoWorks is **not tied to any single organization** — re-branding is a settings change.
- **🌍 Bilingual UI** — full English and Turkish interface, switchable at runtime.

## Why GoWorks

The Google Admin Console is powerful but slow for repetitive lifecycle work — there is no good bulk CSV workflow, no signature templating, and offboarding is a manual checklist. GoWorks is built for IT admins and Workspace operators who do these tasks every week:

- **No infrastructure** — download, connect your Google Cloud project, done. No server, no database setup.
- **Bring your own credentials** — you create the OAuth client in *your* Google Cloud project. Your tokens and data stay local.
- **Multi-tenant by design** — nothing about any customer is hardcoded; one build works for any organization.
- **Open source** — Apache 2.0 licensed. Audit it, fork it, adapt it.

## Screenshots

<!-- TODO: add screenshots or a short GIF of the Dashboard, Bulk Operations, and the Signature editor here -->
_Screenshots coming soon._

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40 |
| UI | React 18, Vite 5, TailwindCSS 4, Framer Motion, Lucide |
| Language | TypeScript (strict) |
| Local data | better-sqlite3 (SQLite), in-process job queue |
| Google APIs | googleapis, google-auth-library (OAuth2 + Service Account / DWD) |
| Reliability | Bottleneck (rate limiting), exponential-backoff retry |
| i18n | i18next, react-i18next |
| Testing | Vitest, Testing Library (jsdom) |

## Getting Started

### Prerequisites

- **Node.js 18+** (20 recommended)
- A **Google Workspace** account with **super-admin** privileges
- A **Google Cloud project** you control

### 1. Set up a Google Cloud project

GoWorks does not ship with credentials — each deployment uses its own Google Cloud OAuth client. This keeps your data isolated and means you control your own API quota.

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable these APIs: **Admin SDK API**, **Groups Settings API**, and **Gmail API**.
3. Configure the **OAuth consent screen** — choose the **Internal** user type (recommended for a single organization; no Google verification required).
4. Create an **OAuth client ID** with application type **Desktop app**. Keep the Client ID and Secret handy — the onboarding wizard will ask for them on first launch.

   > **No `.env` required.** The OAuth Client ID/Secret are collected via the onboarding wizard's "Google Cloud project" step and stored locally — Client ID in the SQLite `app_config` table and the secret encrypted in the OS keychain (Keychain on macOS, DPAPI on Windows). You can rotate them later from Settings → Genel → "Google OAuth Bilgileri".
   >
   > For local development you can still drop the values into `.env` (copy `.env.example`); on first launch they are auto-migrated to encrypted storage and the file is renamed to `.env.migrated` in production builds (kept untouched in dev).

### 2. Install and run

```bash
git clone https://github.com/umutcankurt/goworks.git
cd goworks
npm install
npm run dev
```

The onboarding wizard launches on first run and walks you through the rest.

### 3. (Optional) Service Account for Gmail features

Gmail signature deployment and job-completion emails require a **Service Account with Domain-Wide Delegation (DWD)**:

1. In your Google Cloud project, create a Service Account and generate a JSON key.
2. In the [Google Admin Console](https://admin.google.com/) → **Security → API controls → Domain-wide delegation**, authorize the Service Account's client ID for the [DWD scopes](#oauth-scopes).
3. In GoWorks, open **Settings → Service Account** and upload the JSON key. It is stored at `app.getPath('userData')/secrets/service-account.json` with `0600` permissions and never leaves your machine.

## Building Installers

```bash
npm run build
```

Produces platform installers under `release/{version}/` — macOS `.dmg`, Windows `.exe` (NSIS), and Linux `AppImage`. There is no auto-update; distribute new versions manually.

## Troubleshooting

### `No handler registered for 'X'` (random IPC errors after building installers)

If you ran `npm run build` (which produces both `-m` and `-w` artifacts) and then went back to your dev machine, the native `better-sqlite3` binary in `node_modules/` may be compiled for the wrong platform or Electron ABI. The symptom is a random IPC error in the renderer — `config:set`, `auth:check`, `config:getAll`, etc.

Three independent defenses are in place:

1. **`npm run dev`** detects ABI mismatch via the `predev` hook and auto-rebuilds. A visible banner is printed so you know why startup is slow (~30–60s).
2. **Boot-check** — if the mismatch is somehow still present at runtime, an error dialog shows the exact remediation command before the app exits.
3. **Manual fix** — `npm run rebuild` (alias for `electron-builder install-app-deps`) at any time.

**CI / strict mode**: set `CHECK_NATIVE_ABI_STRICT=1` (or run under `CI=true`, which GitHub Actions and most CI runners set automatically) to make the predev hook fail loudly instead of auto-rebuilding.

You can also run `npm run abi:check` standalone to check the binary without invoking dev.

## Architecture

GoWorks uses Electron's standard two-process split:

- **Renderer** (`src/`) — the React app. Never touches Google APIs directly.
- **Main** (`electron/`) — the Node.js process: OAuth, all Google API calls, the SQLite database, and the job queue.
- **Bridge** (`electron/preload.ts`) — a context bridge exposing safe IPC channels.

```
React (renderer) → window.electronAPI.invoke(channel) → ipcMain.handle → services → Google APIs
```

The job queue is SQLite-backed with an in-process runner: per-job-type concurrency limits, cancellation, exponential-backoff retry on `429 / 503 / ECONNRESET`, and crash-safe resumption of `RUNNING` jobs on startup.

See [`CLAUDE.md`](CLAUDE.md) for a deeper architecture reference.

## OAuth Scopes

**Interactive admin sign-in** (your OAuth client):

| Scope | Purpose |
|---|---|
| `userinfo.profile`, `userinfo.email` | Identify the signed-in admin |
| `admin.directory.user` | Read & manage users |
| `admin.directory.group` | Read & manage groups |
| `admin.directory.orgunit.readonly` | Read org units |
| `admin.directory.domain.readonly` | Read domains |
| `admin.reports.audit.readonly` | Admin audit log |
| `admin.reports.usage.readonly` | Storage & usage reports |
| `apps.groups.settings` | Group access settings |

**Service Account (DWD)** — only needed for Gmail features:

| Scope | Purpose |
|---|---|
| `admin.directory.user` | Resolve users for signature push |
| `admin.directory.group.readonly` | Resolve group membership |
| `admin.directory.orgunit.readonly` | Resolve org units |
| `gmail.settings.basic` | Set Gmail signatures |
| `gmail.send` | Send job-completion notification emails |

## Security & Privacy

- **Your credentials, your project** — GoWorks ships no API keys. You create the OAuth client; tokens are stored locally in your OS user-data directory.
- **Admin-only** — sign-in is rejected unless the account is a Workspace admin on your configured domain.
- **Local-only data** — the SQLite database, OAuth tokens, and the Service Account key never leave your machine. There is no telemetry and no GoWorks backend.
- **Idle auto-logout** — the session ends after 2 hours of inactivity.
- Never commit your `.env` or `service-account.json` — both are git-ignored by default.

## Contributing

Contributions, issues, and feature requests are welcome. Before opening a pull request, please make sure the local checks pass:

```bash
npm run lint      # ESLint, zero warnings
npx tsc --noEmit  # TypeScript strict
npm run test      # Vitest
```

If GoWorks is useful to you, a ⭐ on the repository helps others find it.

## License

Licensed under the [Apache License 2.0](LICENSE). You are free to use, modify, and distribute it, including commercially.

## Disclaimer

GoWorks is an independent open-source project. It is **not affiliated with, endorsed by, or sponsored by Google LLC**. "Google Workspace", "Google", and "Gmail" are trademarks of Google LLC. Use of the Google APIs through GoWorks is subject to the [Google APIs Terms of Service](https://developers.google.com/terms).
