/**
 * Hosts the app may open in the user's default browser.
 *
 * Every legitimate `window.open` in this app targets Google documentation or
 * console pages (see src/lib/legal.ts, src/lib/required-google-apis.ts,
 * CloudProjectStep.tsx, and the target="_blank" anchors in Settings/Login).
 * Keeping the set closed means a compromised renderer cannot use the app as a
 * launcher for phishing pages — opened in the browser where the admin's live
 * Google session already is — or as an SSRF-by-proxy into internal http
 * endpoints the browser can reach.
 */
export const ALLOWED_EXTERNAL_HOSTS: ReadonlySet<string> = new Set([
    'console.cloud.google.com',
    'accounts.google.com',
    'admin.google.com',
    'policies.google.com',
    'support.google.com',
    'developers.google.com',
    'workspace.google.com',
    'myaccount.google.com',
]);

/**
 * May this URL be handed to shell.openExternal?
 *
 * Parses rather than prefix-matches. A `url.startsWith('https://')` check
 * passes `https://evil.tld`, and string checks against a host are defeated by
 * `https://console.cloud.google.com.evil.tld` and by userinfo (`https://
 * console.cloud.google.com@evil.tld`) — both of which `new URL()` resolves
 * correctly to the real hostname.
 */
export function isAllowedExternalUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        // https only: the allowlist governs *who*, this governs *how*.
        if (parsed.protocol !== 'https:') return false;
        return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}
