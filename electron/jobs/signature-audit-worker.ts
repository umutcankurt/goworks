import { jobRunner, type WorkerContext } from './runner';
import { jobQueue } from './queue';
import type { JobExecutionReport, JobRecord } from './types';
import { gmailLimiter } from '../services/rate-limiters';
import { withRetry } from '../services/retry';
import { getLogger } from '../services/logger';
import { templateService } from '../services/template-service';
import { getSignature } from '../services/gmail-signature-service';
import { signatureStateService } from '../services/signature-state-service';
import {
    resolveAudience,
    computeDesired,
    checkRequiredData,
    categorize,
    insertAuditItem,
    deleteAuditItems,
    type AuditScope,
    type AuditDepth,
    type AuditCategory,
} from '../services/signature-audit-service';

const DB_BATCH_INTERVAL_MS = 2000;
const PROGRESS_DEBOUNCE_MS = 500;

interface SignatureAuditPayload {
    scope: AuditScope;
    templateId: number;
    depth: AuditDepth;
}

/**
 * SIGNATURE_AUDIT job worker'ı — bir kapsamdaki kişilerin imzasını taranıp seçilen
 * şablona göre kategorize eder, sonuçları `signature_audit_items` tablosuna yazar.
 * İmza basmaz; sadece okur ve raporlar (apply ayrı bir BULK_SIGNATURE_PUSH job'udur).
 */
async function processJob(
    job: JobRecord,
    ctx: WorkerContext,
): Promise<{ executionReport: JobExecutionReport; status: 'COMPLETED' | 'FAILED' }> {
    const log = getLogger();
    const adminEmail = job.createdBy;
    const payload = (job.payload || {}) as SignatureAuditPayload;

    if (!payload.templateId) throw new Error('templateId gerekli');
    const template = templateService.get(payload.templateId);
    if (!template) throw new Error(`Şablon bulunamadı: ${payload.templateId}`);

    const startedAt = Date.now();

    // Yeniden başlatma (resumeOnStartup) durumunda mükerrer satır olmasın: temiz başla.
    deleteAuditItems(job.id);

    // Kitleyi çöz — kişi listesini ve profilleri getir
    const audience = await resolveAudience(payload.scope, adminEmail);
    const total = audience.length;
    jobQueue.setTotal(job.id, total);

    // Hızlı mod karşılaştırması için tüm durum kayıtlarını tek seferde çek
    const stateMap = signatureStateService.getMany(audience.map((e) => e.profile.email));

    const counts: Record<AuditCategory, number> = {
        ok: 0, drift: 0, no_signature: 0, missing_data: 0, error: 0,
    };
    let processed = 0;
    let lastDbUpdate = Date.now();
    let lastEmit = 0;

    for (let i = 0; i < total; i++) {
        if (ctx.isCancelled()) {
            log.info(`Audit job ${job.id} cancelled at ${i}/${total}`);
            break;
        }

        const entry = audience[i];
        const email = entry.profile.email;

        try {
            if (entry.resolveError) {
                insertAuditItem({
                    jobId: job.id, email, category: 'error',
                    reason: 'resolve_error', error: entry.resolveError,
                });
                counts.error++;
            } else {
                const desired = computeDesired(entry.profile, template.htmlContent, payload.templateId);
                const missingReason = checkRequiredData(entry.profile);
                const state = stateMap.get(email) ?? null;

                let liveSignature: string | undefined;
                if (payload.depth === 'deep' && !missingReason) {
                    liveSignature = await withRetry(
                        () => gmailLimiter.schedule(() => getSignature(email)),
                        log, `getSignature(${email})`,
                    );
                }

                const { category, reason } = categorize({
                    depth: payload.depth,
                    missingReason,
                    desired,
                    state,
                    liveSignature,
                });

                // Derin mod: canlı imza hedefle birebir uyumluysa durum kaydını "iyileştir"
                // ki sonraki Hızlı taramalar bu kişiyi doğru ("güncel") değerlendirsin.
                if (payload.depth === 'deep' && category === 'ok') {
                    signatureStateService.recordPush(
                        email, payload.templateId, desired.html, desired.variables,
                    );
                }

                insertAuditItem({
                    jobId: job.id,
                    email,
                    category,
                    reason,
                    currentVariables: desired.variables,
                    previousVariables: state?.variablesSnapshot ?? null,
                });
                counts[category]++;
            }
        } catch (err: any) {
            insertAuditItem({
                jobId: job.id, email, category: 'error',
                reason: 'scan_error', error: err?.message || String(err),
            });
            counts.error++;
            log.error(`Audit scan failed for ${email}`, err?.message);
        }

        processed = i + 1;
        const now = Date.now();

        if (now - lastDbUpdate > DB_BATCH_INTERVAL_MS) {
            ctx.saveProgress({ progress: processed, succeeded: processed - counts.error, failed: counts.error });
            lastDbUpdate = now;
        }
        if (now - lastEmit > PROGRESS_DEBOUNCE_MS) {
            ctx.emitProgress({
                progress: processed, total,
                succeeded: processed - counts.error, failed: counts.error,
                currentUser: email,
            });
            lastEmit = now;
        }
    }

    ctx.saveProgress({ progress: processed, succeeded: processed - counts.error, failed: counts.error });

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const executionReport: JobExecutionReport = {
        totalProcessed: processed,
        successCount: counts.ok,
        failedCount: counts.error,
        succeededItems: [],
        failedItems: [],
        executedAt: new Date().toISOString(),
        timing: {
            startedAt: new Date(startedAt).toISOString(),
            completedAt: new Date(completedAt).toISOString(),
            durationMs,
            avgItemMs: processed > 0 ? Math.round(durationMs / processed) : 0,
            throughputPerSec: durationMs > 0 ? +(processed / (durationMs / 1000)).toFixed(2) : 0,
        },
    };

    const status: 'COMPLETED' | 'FAILED' =
        total > 0 && counts.error === total ? 'FAILED' : 'COMPLETED';
    return { executionReport, status };
}

export function registerSignatureAuditWorker(): void {
    jobRunner.registerHandler('SIGNATURE_AUDIT', processJob);
}
