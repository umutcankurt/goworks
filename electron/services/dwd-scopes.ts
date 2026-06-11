/**
 * OAuth scopes that GoWorks requests via the Service Account.
 * This list is the single source of truth for both the scope combination used
 * by the DWD test flow and the scope list presented to the user in the UI to
 * paste into "Admin Console → Domain-wide delegation".
 */
// Only the scopes that the Service Account actually uses.
// Features like Groups/Reports/audit work via OAuth (admin login), no SA needed.
export const DWD_SCOPES: readonly string[] = [
    'https://www.googleapis.com/auth/admin.directory.user',          // google-admin-sa.ts
    'https://www.googleapis.com/auth/admin.directory.group.readonly', // google-admin-sa.ts
    'https://www.googleapis.com/auth/admin.directory.orgunit.readonly', // google-admin-sa.ts
    'https://www.googleapis.com/auth/gmail.settings.basic',           // gmail-signature-service.ts
    'https://www.googleapis.com/auth/gmail.send',                     // email-notification-service.ts
] as const;

/** Format pasted as a single comma-separated line into the Admin Console DWD screen. */
export const DWD_SCOPES_CSV = DWD_SCOPES.join(',');
