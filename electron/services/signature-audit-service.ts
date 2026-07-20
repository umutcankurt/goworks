import { getDb } from '../db';
import { renderSignatureHtml, sanitizeTemplateHtml, type TemplateVariables } from './template-renderer';
import {
    buildSignatureVariables,
    profileFromGoogleUser,
    type SignatureProfile,
} from './gmail-signature-service';
import { hashSignatureHtml, type SignatureStateRow } from './signature-state-service';
import { listUsers, listGroupMembers, getUserInfo } from './google-admin-sa';
import { institutionService } from './institution-service';
import { adminLimiter } from './rate-limiters';
import { withRetry } from './retry';
import { getLogger } from './logger';

/**
 * Signature Audit service — audience resolution, desired-signature computation, drift
 * categorization, and access to the `signature_audit_items` table. The scan worker
 * (`signature-audit-worker`) uses these helpers.
 */

export type AuditCategory = 'ok' | 'drift' | 'no_signature' | 'missing_data' | 'error';
export type AuditDepth = 'fast' | 'deep';

export interface AuditScope {
    type: 'all' | 'group' | 'orgUnit';
    /** group → group email/key, orgUnit → orgUnitPath */
    value?: string;
}

export interface AudienceEntry {
    profile: SignatureProfile;
    /** Error message if the profile could not be resolved (e.g. group member fetch failed) */
    resolveError?: string;
}

export interface DesiredSignature {
    variables: TemplateVariables;
    html: string;
    hash: string;
    templateId: number;
}

export interface CategorizeResult {
    category: AuditCategory;
    reason: string | null;
}

// ---------------------------------------------------------------------------
// Audience resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the list of people to audit based on the scope selection.
 * - `all` / `orgUnit`: `listUsers` (SA+DWD, projection=full) — returns a full profile
 * - `group`: `listGroupMembers` → `getUserInfo` for each member
 * Suspended users are removed from the list.
 */
export async function resolveAudience(scope: AuditScope, adminEmail: string): Promise<AudienceEntry[]> {
    const log = getLogger();
    const entries: AudienceEntry[] = [];

    if (scope.type === 'all' || scope.type === 'orgUnit') {
        let query: string | undefined;
        if (scope.type === 'orgUnit') {
            if (!scope.value) throw new Error('Kuruluş birimi seçilmedi');
            query = `orgUnitPath='${scope.value.replace(/'/g, "\\'")}'`;
        }
        const users = await listUsers(adminEmail, query);
        for (const u of users) {
            entries.push({ profile: profileFromGoogleUser(u.primaryEmail || '', u) });
        }
    } else if (scope.type === 'group') {
        if (!scope.value) throw new Error('Mail grubu seçilmedi');
        const members = await listGroupMembers(adminEmail, scope.value);
        const userMembers = members.filter((m) => (m.type || 'USER') === 'USER' && m.email);
        for (const m of userMembers) {
            try {
                const info = await adminLimiter.schedule(() =>
                    withRetry(() => getUserInfo(m.email, adminEmail), log, `getUserInfo(${m.email})`),
                );
                entries.push({ profile: profileFromGoogleUser(m.email, info) });
            } catch (err: any) {
                entries.push({
                    profile: { email: m.email, givenName: '', familyName: '', title: '', department: '', phone: '' },
                    resolveError: err?.message || String(err),
                });
            }
        }
    }

    // Suspended users are not audited (those with a profile error are still shown)
    return entries.filter((e) => e.resolveError || !e.profile.suspended);
}

// ---------------------------------------------------------------------------
// Desired-signature computation
// ---------------------------------------------------------------------------

/** Renders the desired signature from the profile + template and produces a fingerprint. */
export function computeDesired(
    profile: SignatureProfile,
    templateHtml: string,
    templateId: number,
): DesiredSignature {
    const variables = buildSignatureVariables(profile);
    // Must be the same function the push paths use, or the fingerprint describes
    // a signature we would never actually send.
    const html = renderSignatureHtml(templateHtml, variables);
    const hash = hashSignatureHtml(html);
    return { variables, html, hash, templateId };
}

// ---------------------------------------------------------------------------
// Required-field gate
// ---------------------------------------------------------------------------

/**
 * Required-data check: if the title, phone, or institution match is missing, the person is
 * skipped in the audit (decision: a signature without an institution / a partial one is not pushed).
 */
export function checkRequiredData(
    profile: SignatureProfile,
): 'missing_fields' | 'institution_unmatched' | null {
    if (!profile.title.trim() || !profile.phone.trim() || !profile.department.trim()) {
        return 'missing_fields';
    }
    if (!institutionService.findByName(profile.department)) {
        return 'institution_unmatched';
    }
    return null;
}

// ---------------------------------------------------------------------------
// Normalized comparison (Deep mode)
// ---------------------------------------------------------------------------

/**
 * Normalizes signature HTML for comparison — whitespace, line-break, and inter-tag
 * spacing differences are ignored. Since Gmail can make formatting changes when storing
 * the signature, this reduces Deep-mode false positives.
 */
export function normalizeSignatureHtml(html: string): string {
    return sanitizeTemplateHtml(html || '')
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// ---------------------------------------------------------------------------
// Categorization (pure function — testable)
// ---------------------------------------------------------------------------

export interface CategorizeInput {
    depth: AuditDepth;
    /** Error message if the profile could not be resolved */
    resolveError?: string;
    /** Result of `checkRequiredData` */
    missingReason: 'missing_fields' | 'institution_unmatched' | null;
    desired: DesiredSignature;
    /** `signature_state` record (the primary comparison source in Fast mode) */
    state: SignatureStateRow | null;
    /** Live Gmail signature in Deep mode */
    liveSignature?: string;
}

/**
 * Categorizes a person's signature status. Pure function — does not touch the DB/API.
 * - Fast: `signature_state` hash/template comparison
 * - Deep: the live Gmail signature is normalized and compared against the desired one;
 *   the drift reason is still derived from `signature_state`.
 */
export function categorize(input: CategorizeInput): CategorizeResult {
    if (input.resolveError) return { category: 'error', reason: 'resolve_error' };
    if (input.missingReason) return { category: 'missing_data', reason: input.missingReason };

    const { state, desired } = input;
    let driftReason: string;
    if (!state) driftReason = 'no_state';
    else if (state.templateId !== desired.templateId) driftReason = 'template_changed';
    else if (state.desiredHash !== desired.hash) driftReason = 'data_changed';
    else driftReason = 'manual_edit';

    if (input.depth === 'deep') {
        const live = input.liveSignature ?? '';
        if (!live.trim()) return { category: 'no_signature', reason: 'no_signature' };
        if (normalizeSignatureHtml(live) === normalizeSignatureHtml(desired.html)) {
            return { category: 'ok', reason: null };
        }
        return { category: 'drift', reason: driftReason };
    }

    // Fast mode
    if (driftReason === 'manual_edit') return { category: 'ok', reason: null };
    return { category: 'drift', reason: driftReason };
}

// ---------------------------------------------------------------------------
// signature_audit_items tablosu
// ---------------------------------------------------------------------------

export interface SignatureAuditItemRow {
    id: number;
    jobId: string;
    email: string;
    category: AuditCategory;
    reason: string | null;
    currentVariables: Record<string, string> | null;
    previousVariables: Record<string, string> | null;
    error: string | null;
    createdAt: string;
}

function safeParse(s: string | null): Record<string, string> | null {
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

export type AuditItemPayload = {
    jobId: string;
    email: string;
    category: AuditCategory;
    reason: string | null;
    currentVariables?: TemplateVariables | Record<string, string> | null;
    previousVariables?: Record<string, string> | null;
    error?: string | null;
};

export function insertAuditItem(item: AuditItemPayload): void {
    insertAuditItems([item]);
}

/**
 * Inserts multiple audit items in a single transaction.
 * Performance: prevents N+1 query overhead by batching DB I/O.
 */
export function insertAuditItems(items: AuditItemPayload[]): void {
    if (items.length === 0) return;
    const db = getDb();
    const insertMany = db.transaction((batch: AuditItemPayload[]) => {
        const stmt = db.prepare(
            `INSERT INTO signature_audit_items
               (job_id, email, category, reason, current_variables, previous_variables, error)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const item of batch) {
            stmt.run(
                item.jobId,
                item.email,
                item.category,
                item.reason ?? null,
                item.currentVariables ? JSON.stringify(item.currentVariables) : null,
                item.previousVariables ? JSON.stringify(item.previousVariables) : null,
                item.error ?? null,
            );
        }
    });
    insertMany(items);
}

/** Deletes all audit results for a job — for a clean start when the worker restarts. */
export function deleteAuditItems(jobId: string): void {
    getDb().prepare('DELETE FROM signature_audit_items WHERE job_id = ?').run(jobId);
}

export function getAuditItems(jobId: string): SignatureAuditItemRow[] {
    const rows = getDb()
        .prepare('SELECT * FROM signature_audit_items WHERE job_id = ? ORDER BY id ASC')
        .all(jobId) as Array<{
            id: number;
            job_id: string;
            email: string;
            category: string;
            reason: string | null;
            current_variables: string | null;
            previous_variables: string | null;
            error: string | null;
            created_at: string;
        }>;
    return rows.map((r) => ({
        id: r.id,
        jobId: r.job_id,
        email: r.email,
        category: r.category as AuditCategory,
        reason: r.reason,
        currentVariables: safeParse(r.current_variables),
        previousVariables: safeParse(r.previous_variables),
        error: r.error,
        createdAt: r.created_at,
    }));
}
