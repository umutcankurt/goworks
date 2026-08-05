<div align="center">

<img src="build/icon.png" alt="GoWorks logo" width="120" height="120" />

# GoWorks

**Bulk offboarding, Gmail signature deployment, and group management for Google Workspace™.**

A desktop app that runs entirely on your machine — no server, no vendor backend, no telemetry.

[**⬇ Download for macOS**](https://github.com/umutcankurt/goworks/releases/latest) · [**⬇ Download for Windows**](https://github.com/umutcankurt/goworks/releases/latest) · [Try the demo, no account needed](#try-it-without-a-google-account)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-lightgrey.svg)]()
[![Built with Electron](https://img.shields.io/badge/Electron-43-47848F.svg?logo=electron&logoColor=white)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)]()
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

**English** · [Türkçe](README.tr.md)

<img src="docs/demo-bulk.gif" alt="Suspending nine accounts from a CSV: the wizard validates every row, flags one user that does not exist, then runs the job with live progress" width="860">

<sub>Suspending accounts from a CSV — every row validated before anything runs. Recorded in demo mode.</sub>

</div>

---

**GoWorks** is a cross-platform desktop application that gives Google Workspace administrators a fast, focused UI for the day-to-day work that the Google Admin Console makes slow: onboarding and offboarding employees, bulk-suspending or deleting accounts from a CSV, deploying standardized Gmail signatures across the organization, managing groups, and auditing user activity.

It runs **entirely on your machine** — a local SQLite database and an in-process job queue. There is no server to host, no Docker, no external database. You connect it to your own Google Cloud project, and your data never leaves your computer.

## Try it without a Google account

```bash
git clone https://github.com/umutcankurt/goworks.git && cd goworks
npm install && npm run demo:en
```

Demo mode is a **fully clickable prototype** running against an in-memory fixture — no
Google Workspace account, no Service Account, no master password, no internet. Sign-in is
cosmetic; it drops you straight onto the dashboard of a fictional tenant. Use it to judge
whether GoWorks fits your workflow before you set up a Google Cloud project. See
[`docs/DEMO_MODE.md`](docs/DEMO_MODE.md).

## Table of Contents

- [Try it without a Google account](#try-it-without-a-google-account)
- [Why GoWorks](#why-goworks)
- [Features](#features)
- [Screenshots](#screenshots)
- [Install](#install)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Building Installers](#building-installers)
- [Changelog](#changelog)
- [Architecture](#architecture)
- [OAuth Scopes](#oauth-scopes)
- [Security & Privacy](#security--privacy)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)
- [AI-Assisted Development](#ai-assisted-development)

## Why GoWorks

Google Workspace lifecycle work is repetitive, high-frequency, and unforgiving — and the
two standard tools sit at opposite extremes.

| | Admin Console | [GAM](https://github.com/GAM-team/GAM) / GAMADV-XTD3 | **GoWorks** |
|---|---|---|---|
| Bulk work from a CSV | ✗ | ✓ (write a script) | ✓ (guided wizard) |
| Preview before executing | ✗ | ✗ | ✓ (row-by-row validation) |
| Gmail signature templating | ✗ | partial | ✓ (editor + drift audit) |
| Live progress, cancel, retry | ✗ | ✗ | ✓ |
| Learning curve | low | **high** — CLI + scripting | low |
| Runs where | Google's cloud | your terminal | your machine |

GAM is excellent and far broader in scope; if you already have mature GAM automation, keep
it. GoWorks is for the admin who wants the same bulk reach **without writing and
maintaining scripts**, and without handing a SaaS vendor domain-wide access to the tenant.

- **No infrastructure** — download, connect your Google Cloud project, done. No server, no database setup.
- **Bring your own credentials** — you create the OAuth client in *your* Google Cloud project. Your tokens and data stay local.
- **Nothing leaves your machine** — local SQLite, no telemetry, no GoWorks backend.
- **Multi-tenant by design** — nothing about any customer is hardcoded; one build works for any organization. Useful if you manage more than one tenant.
- **Open source** — Apache 2.0 licensed. Audit it, fork it, adapt it. That matters for a tool holding super-admin.

## Features

- **📦 Bulk operations** — drive suspend / delete / signature-push / group-add jobs from a CSV file, with a guided wizard, row-by-row validation before anything runs, cancellable jobs, rate limiting, automatic retry on transient errors, and live progress.
- **🚪 Offboarding & onboarding wizards** — a guided flow to safely deprovision a departing employee (suspend, set email forwarding, remove from groups), and a first-run setup that walks you through branding, the Google Cloud project, the Service Account, and Domain-Wide Delegation.
- **✍️ Gmail signatures** — a WYSIWYG HTML template editor with reusable tokens, a formatting toolbar, starter templates, direct image upload with auto media tokens (`{{image_N}}`), domain-wide deployment via a Service Account, and a **drift audit** that finds users whose signature no longer matches the template.
- **👥 Users & Google Groups** — search, view, and edit profiles and memberships; suspend, delete, and restore accounts; aliases and email forwarding. Full CRUD for groups, members, roles, aliases, and access settings (Directory API + Groups Settings API), plus bulk member import from CSV.
- **🔒 Master-password vault** — the Service Account key and Google refresh token are encrypted at rest with Argon2id + AES-256-GCM. Configurable idle auto-lock, in-app password change, graceful lock that lets running jobs finish, and brute-force lockout with exponential back-off.
- **📊 Dashboard & reports** — active job tracking, Google Admin audit log, and Workspace storage/usage reports.

<details>
<summary><b>More</b> — sign-in, local store, branding, factory reset, i18n</summary>
<br>

- **🔐 Secure Google OAuth2 sign-in** — loopback OAuth flow with domain and admin-role verification. Only Workspace admins from your configured domain can sign in.
- **🗂️ Persistent local store** — templates, job titles, institutions, app config, and full job history in a local SQLite database, with crash-safe job resumption.
- **🎨 Dynamic branding** — company name, sidebar abbreviation, logo, email sender name, and allowed login domain are all configurable in-app. GoWorks is **not tied to any single organization** — re-branding is a settings change.
- **🧹 Factory reset** — securely wipe all data behind a type-to-confirm guard: the vault file is overwritten before deletion and the database free pages / WAL are reclaimed, so nothing sensitive is left behind. A lighter wizard restart that preserves your configuration is also available.
- **⚖️ Terms & disclaimer** — a versioned, locale-aware terms-of-use and liability-disclaimer acceptance gate shown during onboarding and re-prompted when the terms change.
- **🌍 Bilingual UI** — full English and Turkish interface, switchable at runtime.

</details>

## Screenshots

> Captured in the built-in demo mode against a fictional tenant (**ACME Inc.**) — no real
> customer data. See [`docs/DEMO_MODE.md`](docs/DEMO_MODE.md).

| | |
|---|---|
| ![Dashboard](docs/screenshots/en/dashboard.jpg) | ![Bulk Operations](docs/screenshots/en/bulk-operations.jpg) |
| **Dashboard** — storage usage, user counts, and a bulk job reporting live progress | **Bulk Operations** — a CSV drives suspend, delete, signature push, or group add |
| ![Gmail signature editor](docs/screenshots/en/signature-editor.jpg) | ![User detail](docs/screenshots/en/user-detail.jpg) |
| **Gmail signature editor** — reusable tokens, a formatting toolbar, live preview, and an image library | **User detail** — profile, aliases, org unit, and last login |
| ![New user](docs/screenshots/en/new-user.jpg) | ![Group edit](docs/screenshots/en/group-form.jpg) |
| **New user** — assign groups and a Gmail signature as the account is created | **Group edit** — members with per-member role and subscription, plus access settings and aliases |
| ![Settings](docs/screenshots/en/settings.jpg) | ![Login](docs/screenshots/en/login.jpg) |
| **Settings** — company name, logo, allowed domain, and language, all configurable in-app | **Login** — Google sign-in, restricted to admins on your configured domain |

<details>
<summary><b>More screens</b> — offboarding, signature editor, setup wizard, vault lock</summary>
<br>

**Offboarding** — find the departing employee, then step through org-unit change, suspend, group removal, password reset, and email forwarding as one guided flow.

![Offboarding wizard](docs/demo-offboard.gif)

**Signature editor** — edit the template, watch the preview update, and manage the media library.

![Gmail signature editor](docs/demo-signature.gif)

**Onboarding wizard** — nine guided steps, from terms acceptance through the Google Cloud project, the Service Account, and Domain-Wide Delegation.

![Onboarding wizard — welcome](docs/screenshots/en/onboarding.jpg)
![Onboarding wizard — ready](docs/screenshots/en/onboarding-complete.jpg)

**Master-password vault** — an idle timeout locks the app; unlocking restores the Google session without a re-login.

![Vault lock screen](docs/screenshots/en/vault-lock.jpg)

**Signature push** — apply a template to a single user's Gmail signature.

![User detail — signature](docs/screenshots/en/user-detail-signature.jpg)

</details>

## Install

### Download the installer

Grab the latest `.dmg` (macOS) or `.exe` (Windows) from the
[**Releases page**](https://github.com/umutcankurt/goworks/releases/latest). This is the
path most people want — no Node.js, no toolchain. On first launch the onboarding wizard
walks you through connecting your Google Cloud project.

To build from source instead, see [Getting Started](#getting-started).

### The binaries are not code-signed — read this first

GoWorks releases are **not signed with an Apple Developer or Windows code-signing
certificate**, so your OS will warn you that the developer cannot be verified. That is
expected, and we would rather say so plainly than have you discover it at the scary dialog.

Because this app asks for Google Workspace **super-admin** access, you should not simply
click through that warning on our say-so. Verify the download first:

```bash
# macOS / Linux
shasum -a 256 GoWorks-Mac-0.8.1-Installer.dmg

# Windows (PowerShell)
Get-FileHash .\GoWorks-Windows-0.8.1-Setup.exe -Algorithm SHA256
```

**v0.8.1 checksums**

| File | SHA-256 |
|---|---|
| `GoWorks-Mac-0.8.1-Installer.dmg` | `2748beea64f91910b2d406228973688efce69970945b5f214a6975341b43bb8f` |
| `GoWorks-Windows-0.8.1-Setup.exe` | `f5a73f6a59ce242f19a9f663685b2ccac94fdebdba6c284ca33e06f558f8cb31` |

GitHub also records these digests on the release assets themselves, so you can cross-check
them against this table.

Once the hash matches:

- **macOS** — the app is quarantined on first open. Either right-click the app → *Open* →
  *Open*, or clear the flag explicitly:
  ```bash
  xattr -d com.apple.quarantine /Applications/GoWorks.app
  ```
- **Windows** — SmartScreen shows "Windows protected your PC". Choose *More info* →
  *Run anyway*.

If you would rather trust nothing at all, that is the better instinct: the source is
Apache-2.0 and `npm run build` produces the same installers locally.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 43 |
| UI | React 18, Vite 8 (Rolldown), TailwindCSS 4, Framer Motion, Lucide |
| Language | TypeScript (strict) |
| Local data | better-sqlite3 13 (SQLite, N-API), in-process job queue |
| Google APIs | googleapis, google-auth-library (OAuth2 + Service Account / DWD) |
| Reliability | Bottleneck (rate limiting), exponential-backoff retry |
| i18n | i18next, react-i18next |
| Testing | Vitest, Testing Library (jsdom) |

## Getting Started

> Setting up your own Google Cloud project is required **whichever way you install** — the
> installer and a source build both need it. If you only want to look around first, use
> [demo mode](#try-it-without-a-google-account); it needs none of this.

### Prerequisites

- A **Google Workspace** account with **super-admin** privileges
- A **Google Cloud project** you control
- **Node.js 22.12+** — only if you are building from source rather than
  [downloading the installer](#download-the-installer)

### 1. Set up a Google Cloud project

GoWorks does not ship with credentials — each deployment uses its own Google Cloud OAuth client. This keeps your data isolated and means you control your own API quota.

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable these APIs: **Admin SDK API**, **Gmail API**, **Groups Settings API**, and **Google Drive API** (the last is required for uploading signature images).
3. Configure the **OAuth consent screen** — choose the **Internal** user type (recommended for a single organization; no Google verification required).
4. Create an **OAuth client ID** with application type **Desktop app**. Keep the Client ID and Secret handy — the onboarding wizard will ask for them on first launch.

   > **No `.env` required.** The OAuth Client ID/Secret are collected via the onboarding wizard's "Google Cloud project" step and stored locally in the SQLite `app_config` table as plain config. For a desktop app the client secret is a "public client" credential (RFC 8252), not a true secret — and it must be readable before the master-password vault is unlocked, in order to refresh the access token. The genuinely sensitive secrets (Service Account key and refresh token) are encrypted in the vault instead. You can rotate the OAuth values later from Settings → Genel → "Google OAuth Bilgileri".
   >
   > For local development you can still drop the values into `.env` (copy `.env.example`); on first launch they are auto-migrated to encrypted storage and the file is renamed to `.env.migrated` in production builds (kept untouched in dev).

### 2. Install and run

If you [downloaded an installer](#download-the-installer), just open the app — skip to
step 3.

To run from source:

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
3. In GoWorks, open **Settings → Service Account** and upload the JSON key. It is written encrypted into the master-password vault (`vault.enc`) and never leaves your machine. (Older installs that kept the key as a `0600` file under `…/secrets/` are migrated into the vault on first unlock and the plaintext file is removed.)

## Building Installers

```bash
npm run build
```

Produces platform installers under `release/{version}/` — macOS `.dmg` and Windows `.exe` (NSIS). There is no auto-update; distribute new versions manually.

## Troubleshooting

### `No handler registered for 'X'` (random IPC errors)

Historically this meant the native `better-sqlite3` binary in `node_modules/` was built for the wrong platform or the wrong Electron ABI — typically after `npm run build` produced cross-platform artifacts and you went back to developing. The symptom was a random IPC failure in the renderer (`config:set`, `auth:check`, `config:getAll`, …).

**This class of failure is gone as of better-sqlite3 13.** It is an N-API addon that ships a prebuilt binary for every target and selects one by platform and architecture, so it cannot pick a foreign build, and an N-API binary is not tied to an ABI version — Node and Electron load the same file. No rebuild step, no ABI swapping, no cache.

What can still happen is a missing or corrupt `node_modules`. The app's boot-check probes the module before touching the database and, if it cannot load, shows a dialog naming `npm ci` as the fix rather than failing later with an opaque error.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for the per-version release history.

## Architecture

GoWorks uses Electron's standard two-process split:

- **Renderer** (`src/`) — the React app. Never touches Google APIs directly.
- **Main** (`electron/`) — the Node.js process: OAuth, all Google API calls, the SQLite database, and the job queue.
- **Bridge** (`electron/preload.ts`) — a context bridge exposing safe IPC channels.

```
React (renderer) → window.electronAPI.invoke(channel) → ipcMain.handle → services → Google APIs
```

The job queue is SQLite-backed with an in-process runner: per-job-type concurrency limits, cancellation, exponential-backoff retry on `429 / 503 / ECONNRESET`, and crash-safe resumption of `RUNNING` jobs on startup.

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
| `drive.file` | Upload signature images to Drive (only files the app creates) |

**Service Account (DWD)** — only needed for Gmail features:

| Scope | Purpose |
|---|---|
| `admin.directory.user` | Resolve users for signature push |
| `admin.directory.group.readonly` | Resolve group membership |
| `admin.directory.orgunit.readonly` | Resolve org units |
| `gmail.settings.basic` | Set Gmail signatures |
| `gmail.send` | Send job-completion notification emails |

## Security & Privacy

- **Unsigned releases** — the published installers are not code-signed. Verify the SHA-256 checksum before running one; see [Install](#the-binaries-are-not-code-signed--read-this-first).
- **Your credentials, your project** — GoWorks ships no API keys. You create the OAuth client; everything is stored locally in your OS user-data directory.
- **Admin-only** — sign-in is rejected unless the account is a Workspace admin on your configured domain.
- **Master-password vault** — the truly sensitive secrets (Service Account key and the Google refresh token) live encrypted in a master-password vault (`vault.enc`, Argon2id + AES-256-GCM) and never leave your machine. The access token stays in memory only; the OAuth Client ID/Secret are stored as plain config (a desktop app is a "public client" — the secret is not a true secret). Electron `safeStorage` is retired and read only once to migrate older installs.
- **Local-only data** — the SQLite database and all secrets stay on your machine. There is no telemetry and no GoWorks backend.
- **Data location & disposal** — everything lives under your OS user-data directory (`%APPDATA%\GoWorks` on Windows, `~/Library/Application Support/GoWorks` on macOS): `vault.enc` (the encrypted Service Account key and refresh token), `goworks.db` (branding, institutions, templates, and the plain-config OAuth client secret), and `logs/` (which may contain email addresses). When you retire a machine, dispose of this data deliberately: on **Windows** the uninstaller offers to delete it (opt-in; the default is to keep it), and on **macOS** — where there is no uninstall hook — run **Settings → Factory Reset** first. Factory Reset performs a secure wipe (overwrite-then-unlink of `vault.enc`, `VACUUM` + `wal_checkpoint(TRUNCATE)` on the database, and log removal).
- **Idle auto-lock** — after a configurable idle period (default 1 hour; set in Settings → Genel → Güvenlik, `0` = off) the vault **locks** rather than logging out: in-memory credentials are dropped but the refresh token survives in the vault, so unlocking with the master password silently restores the Google session. If the stored session can no longer be refreshed (for example the refresh token was revoked), a dedicated re-authentication screen guides you back through sign-in instead of failing silently.
- **Forgetting the master password is unrecoverable** — the only path forward is resetting the vault, which wipes the stored Service Account key and session; you then re-upload the key and sign in to Google again.
- Never commit your `.env` — it is git-ignored by default.

Found a vulnerability? Please report it privately — see [`SECURITY.md`](SECURITY.md).

## Contributing

Contributions, issues, and feature requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup and conventions. Before opening a pull request, please make sure the local checks pass:

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

## AI-Assisted Development

This project was built with the help of AI tools — primarily Anthropic's Claude. Code, documentation, and tests were reviewed before merging, but no automated assistant is infallible.

GoWorks acts on your Google Workspace tenant with administrative privileges, and some of its operations (suspension, deletion, bulk changes) are irreversible. **Please run your own review and testing before pointing it at a production tenant.**
