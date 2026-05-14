import { getDb } from '../db';
import { renderTemplate, sanitizeTemplateHtml, type TemplateVariables } from './template-renderer';
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
 * İmza Denetimi servisi — kitle çözümleme, hedef imza hesaplama, sapma kategorize etme
 * ve `signature_audit_items` tablosuna erişim. Tarama worker'ı (`signature-audit-worker`)
 * bu yardımcıları kullanır.
 */

export type AuditCategory = 'ok' | 'drift' | 'no_signature' | 'missing_data' | 'error';
export type AuditDepth = 'fast' | 'deep';

export interface AuditScope {
    type: 'all' | 'group' | 'orgUnit';
    /** group → grup e-postası/anahtarı, orgUnit → orgUnitPath */
    value?: string;
}

export interface AudienceEntry {
    profile: SignatureProfile;
    /** Profil çözümlenemediyse (örn. grup üyesi alınamadı) hata mesajı */
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
// Kitle çözümleme
// ---------------------------------------------------------------------------

/**
 * Denetlenecek kişi listesini kapsam (scope) seçimine göre çözer.
 * - `all` / `orgUnit`: `listUsers` (SA+DWD, projection=full) — profil dolu döner
 * - `group`: `listGroupMembers` → her üye için `getUserInfo`
 * Askıya alınmış (suspended) kullanıcılar listeden çıkarılır.
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

    // Askıya alınmış kullanıcılar denetlenmez (profil hatası olanlar yine de gösterilir)
    return entries.filter((e) => e.resolveError || !e.profile.suspended);
}

// ---------------------------------------------------------------------------
// Hedef imza hesaplama
// ---------------------------------------------------------------------------

/** Profil + şablondan hedef imzayı render eder ve parmak izini üretir. */
export function computeDesired(
    profile: SignatureProfile,
    templateHtml: string,
    templateId: number,
): DesiredSignature {
    const variables = buildSignatureVariables(profile);
    const html = renderTemplate(templateHtml, variables);
    const hash = hashSignatureHtml(html);
    return { variables, html, hash, templateId };
}

// ---------------------------------------------------------------------------
// Zorunlu alan kapısı
// ---------------------------------------------------------------------------

/**
 * Zorunlu veri kontrolü: unvan, telefon veya kurum eşleşmesi eksikse kişi denetimde
 * atlanır (karar: kurumsuz/yarım imza basılmaz).
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
// Normalize edilmiş karşılaştırma (Derin mod)
// ---------------------------------------------------------------------------

/**
 * İmza HTML'ini karşılaştırma için normalize eder — boşluk, satır sonu ve tag-arası
 * boşluk farkları yok sayılır. Gmail imzayı saklarken bi­çimsel değişiklikler yapabildiği
 * için Derin mod yanlış-pozitiflerini azaltır.
 */
export function normalizeSignatureHtml(html: string): string {
    return sanitizeTemplateHtml(html || '')
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// ---------------------------------------------------------------------------
// Kategorize etme (saf fonksiyon — test edilebilir)
// ---------------------------------------------------------------------------

export interface CategorizeInput {
    depth: AuditDepth;
    /** Profil çözümlenemediyse hata mesajı */
    resolveError?: string;
    /** `checkRequiredData` sonucu */
    missingReason: 'missing_fields' | 'institution_unmatched' | null;
    desired: DesiredSignature;
    /** `signature_state` kaydı (Hızlı modda asıl karşılaştırma kaynağı) */
    state: SignatureStateRow | null;
    /** Derin modda canlı Gmail imzası */
    liveSignature?: string;
}

/**
 * Bir kişinin imza durumunu kategorize eder. Saf fonksiyon — DB/API'ye dokunmaz.
 * - Hızlı: `signature_state` hash/template karşılaştırması
 * - Derin: canlı Gmail imzası normalize edilip hedefle karşılaştırılır; sapma sebebi
 *   yine `signature_state`'ten türetilir.
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

    // Hızlı mod
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

export function insertAuditItem(item: {
    jobId: string;
    email: string;
    category: AuditCategory;
    reason: string | null;
    currentVariables?: TemplateVariables | Record<string, string> | null;
    previousVariables?: Record<string, string> | null;
    error?: string | null;
}): void {
    getDb()
        .prepare(
            `INSERT INTO signature_audit_items
               (job_id, email, category, reason, current_variables, previous_variables, error)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            item.jobId,
            item.email,
            item.category,
            item.reason ?? null,
            item.currentVariables ? JSON.stringify(item.currentVariables) : null,
            item.previousVariables ? JSON.stringify(item.previousVariables) : null,
            item.error ?? null,
        );
}

/** Bir job'a ait tüm denetim sonuçlarını siler — worker yeniden başladığında temiz başlangıç için. */
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
