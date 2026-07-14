import type { OAuth2Client } from 'google-auth-library';

/**
 * Bridges the logged-in admin's OAuth client to background job workers.
 *
 * `authService` is instantiated as a module-private `let` in `main.ts` and is not
 * exported, so workers cannot import it directly. `main.ts` registers a provider
 * here right after creating the AuthService; workers call `getAuthClient()`.
 *
 * Group operations must run with the admin's OAuth token (not Service Account +
 * DWD) so the Admin Audit log's `actor.email` is the admin who started the job.
 */
let provider: (() => OAuth2Client) | null = null;

export function setAuthClientProvider(fn: () => OAuth2Client): void {
    provider = fn;
}

/** Returns the admin OAuth client. Throws if there is no active admin session. */
export function getAuthClient(): OAuth2Client {
    if (!provider) throw new Error('No active admin session');
    return provider();
}
