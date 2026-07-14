# Screenshots

Two language sets, same twelve filenames, so the two line up frame for frame:

| Folder | Tenant | Referenced from |
|---|---|---|
| `en/` | **ACME Inc.** | [`README.md`](../../README.md) |
| `tr/` | **ABC Şirketi** | [`README.tr.md`](../../README.tr.md) |

## The set

Eight are shown directly in the README gallery; four sit behind a `<details>` toggle
below it. Both folders carry all twelve.

| Filename | Screen | In the README |
|---|---|---|
| `dashboard.jpg` | Dashboard — storage usage, user counts, live job progress | gallery |
| `bulk-operations.jpg` | Bulk Operations — action selection (suspend / delete / signature / group add) | gallery |
| `signature-editor.jpg` | Gmail signature editor — toolbar, tokens, live preview, media library | gallery |
| `user-detail.jpg` | User detail — profile, aliases, org unit | gallery |
| `new-user.jpg` | New user — group assignment and a signature assigned at creation | gallery |
| `group-form.jpg` | Group edit — Members tab, per-member role and subscription | gallery |
| `settings.jpg` | Settings → General — branding, allowed domain, language | gallery |
| `login.jpg` | Login — domain- and admin-restricted Google sign-in | gallery |
| `onboarding.jpg` | Setup wizard — step 1 (Welcome) | collapsed |
| `onboarding-complete.jpg` | Setup wizard — step 9 (Ready) | collapsed |
| `vault-lock.jpg` | Vault lock screen — master password | collapsed |
| `user-detail-signature.jpg` | User detail → Signature — push a template to Gmail | collapsed |

Adding a screen means adding it to **both** folders under the same name, and listing it
here.

## How they were captured — demo mode

**Do not point the app at a real tenant.** Every list screen would show real names,
emails, phone numbers and IP addresses.

The built-in prototype serves a fictional tenant from an in-memory fixture — no Google
account, no vault, no database:

```bash
npm run demo                  # Turkish  — ABC Şirketi
npm run demo:en               # English  — ACME Inc.
npm run demo:onboarding       # first-run install, for the setup wizard screens
npm run demo:onboarding:en
```

See [`docs/DEMO_MODE.md`](../DEMO_MODE.md). The login button is cosmetic; it drops you
straight onto the dashboard. Reloading resets everything to the same starting state, so
a capture run is repeatable.

Screens that need a nudge before they show anything:

- **Users** starts on an empty "search for a user" state. Type `@` and press Enter to
  list everyone.
- **Bulk Operations** needs a CSV dropped on it if you want the analysis/progress steps.
- **Vault lock** — click the lock icon in the header. Any password unlocks it.
- **Setup wizard** — `demo:onboarding` starts it at step 1. The Service Account step
  accepts any JSON file (the contents are not parsed), and the Domain-Wide Delegation
  step needs its "Test DWD connection" button clicked, or step 9 reports DWD as pending
  instead of verified.

## Capture guidelines

- Light theme, app window only (no desktop background, no personal taskbar).
- ~1600px wide. The set was captured by reading the window rect straight from the
  running app (`osascript` → `System Events`), grabbing it with
  `screencapture -R <rect>`, then downscaling the 2x Retina grab with `sips -Z 1600`
  and encoding as JPEG at quality 88.
