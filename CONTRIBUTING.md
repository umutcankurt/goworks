# Contributing to GoWorks

Thanks for your interest in improving GoWorks! Contributions, issues, and
feature requests are all welcome. This guide covers how to get a development
environment running and what we expect in a pull request.

## Getting Started

GoWorks is an Electron + React + TypeScript desktop app. You need **Node.js 20+**
(see [`.nvmrc`](.nvmrc)) and npm.

```bash
git clone https://github.com/umutcankurt/goworks.git
cd goworks
npm install
npm run dev      # Vite dev server + Electron with hot reload
```

No `.env` is required to start: on first launch the onboarding wizard collects
your Google Cloud OAuth Client ID/Secret and stores them as plain config in the
SQLite `app_config` table (a desktop app is a "public client" — the secret is
not a true secret and must be readable before the vault is unlocked). The
genuinely sensitive secrets — the Service Account key and the OAuth refresh
token — are encrypted in a master-password vault (`vault.enc`, Argon2id +
AES-256-GCM) that you create during onboarding. For local development you may
optionally place `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in a `.env` file —
it is git-ignored and auto-migrated on first run. **Never commit credentials.**

> **Vault during development.** The first run walks you through a master-password
> setup step, and the vault locks on idle (configurable in Settings → Genel). To
> start from a clean slate while testing, use the lock screen's "forgot password
> → reset" flow or a factory reset — both wipe `vault.enc`.

See [`CLAUDE.md`](CLAUDE.md) for a deeper architecture reference (process split,
IPC channels, services, the local DB, and the job queue).

## Project Layout

- `src/` — the React renderer. Never calls Google APIs directly.
- `electron/` — the Node.js main process: OAuth, Google API calls, SQLite, job queue.
- `electron/preload.ts` — the context bridge exposing safe IPC channels.

## Code Style & Checks

The project is TypeScript **strict** with ESLint set to **zero warnings**.
Before opening a pull request, make sure all checks pass:

```bash
npm run lint       # ESLint — must be clean (max-warnings: 0)
npx tsc --noEmit   # TypeScript strict type-check
npm run test       # Vitest (jsdom)
npm run build      # full production build (catches native/build issues)
```

Additional conventions:

- **Path alias** — import from `@/...` (maps to `src/`).
- **`any` is allowed** but prefer precise types where practical.
- **Internationalization (required)** — the UI is bilingual (English + Turkish).
  Whenever you add a `t()` key, update **both** `src/i18n/locales/en/*.json` and
  `src/i18n/locales/tr/*.json` in the **same commit**. PRs that add a key to only
  one locale will be asked to add the other.
- **No customer-specific data** — branding (company name, logo, domain, sender
  name) is dynamic and stored in app config. Never hardcode an organization's
  details in source.

## Commits & Pull Requests

- Follow the existing **Conventional Commits** style used in the git history,
  e.g. `feat(groups): ...`, `fix(auth): ...`, `chore: ...`, `style(toast): ...`.
- Keep pull requests focused; one logical change per PR is easier to review.
- Describe **what** changed and **why**, and include screenshots for UI changes.
- Confirm in the PR description that `lint`, `tsc`, `test`, and `build` pass.

## Reporting Bugs & Requesting Features

Open an issue with clear reproduction steps (and your OS + GoWorks version for
bugs). For **security vulnerabilities**, do not open a public issue — follow
[`SECURITY.md`](SECURITY.md) instead.

## License

By contributing, you agree that your contributions will be licensed under the
project's [Apache License 2.0](LICENSE).
