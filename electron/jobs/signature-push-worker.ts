import { jobRunner, type WorkerContext } from './runner';
import type { JobExecutionReport, JobRecord } from './types';
import { adminLimiter, gmailLimiter } from '../services/rate-limiters';
import { withRetry } from '../services/retry';
import { getLogger } from '../services/logger';
import { templateService } from '../services/template-service';
import { institutionService } from '../services/institution-service';
import { renderTemplate } from '../services/template-renderer';
import { formatPhoneForSignature } from '../services/phone';
import { getUserInfo, updateUser } from '../services/google-admin-sa';
import { setSignature } from '../services/gmail-signature-service';
import { signatureStateService } from '../services/signature-state-service';
import type { ValidatedRow } from '../services/csv-analysis';

const DB_BATCH_SIZE = 10;
const DB_BATCH_INTERVAL_MS = 2000;
const PROGRESS_DEBOUNCE_MS = 500;

interface SignaturePushPayload {
    rows?: ValidatedRow[];
    emails?: string[];
    templateId?: number;
}

async function processJob(
    job: JobRecord,
    ctx: WorkerContext,
): Promise<{ executionReport: JobExecutionReport; status: 'COMPLETED' | 'FAILED' }> {
    const log = getLogger();
    const adminEmail = job.createdBy;
    const payload = (job.payload || {}) as SignaturePushPayload;

    if (!payload.templateId) throw new Error('templateId gerekli');
    const template = templateService.get(payload.templateId);
    if (!template) throw new Error(`Şablon bulunamadı: ${payload.templateId}`);

    const startedAt = Date.now();
    let succeeded = job.succeeded || 0;
    let failed = job.failed || 0;
    // Stall recovery: önceki seans batch flush'larından gelen item detaylarını yükle.
    const prevReport = job.executionReport;
    const succeededItems: JobExecutionReport['succeededItems'] = prevReport?.succeededItems
        ? [...prevReport.succeededItems]
        : [];
    const failedItems: JobExecutionReport['failedItems'] = prevReport?.failedItems
        ? [...prevReport.failedItems]
        : [];

    let lastDbUpdate = Date.now();
    let lastEmit = 0;

    const rows = payload.rows;
    const emails = payload.emails;

    const total = rows ? rows.length : (emails?.length ?? 0);
    const startIndex = job.progress || 0; // resume support

    for (let i = startIndex; i < total; i++) {
        if (ctx.isCancelled()) {
            log.info(`Job ${job.id} cancelled at ${i}/${total}`);
            break;
        }

        let email = '';
        let rowNumber: number | undefined;

        try {
            if (rows) {
                const v = rows[i];
                email = v.data.email;
                rowNumber = v.rowNumber;
                const institutionAddress = v.resolvedData?.institutionAddress || '';
                const institutionPhone = v.resolvedData?.institutionPhone || '';
                // Geri uyum: CSV hâlâ eski kampus_adi sütununu kullanmış olabilir
                // (csv-analysis normalize ediyor; her ihtimale karşı fallback).
                const institutionName = v.data.kurum_adi || v.data.kampus_adi || '';

                // Build PATCH body — only non-empty fields
                const patchBody: any = {};
                if (v.data.ad || v.data.soyad) {
                    patchBody.name = {};
                    if (v.data.ad) patchBody.name.givenName = v.data.ad;
                    if (v.data.soyad) patchBody.name.familyName = v.data.soyad;
                }
                if (v.data.unvan || institutionName) {
                    patchBody.organizations = [{
                        ...(v.data.unvan && { title: v.data.unvan }),
                        ...(institutionName && { department: institutionName }),
                        primary: true,
                    }];
                }
                if (v.data.telefon) patchBody.phones = [{ value: v.data.telefon, type: 'work' }];
                if (institutionAddress) patchBody.addresses = [{ type: 'work', formatted: institutionAddress }];

                if (Object.keys(patchBody).length > 0) {
                    await withRetry(
                        () => adminLimiter.schedule(() => updateUser(email, patchBody, adminEmail)),
                        log, `updateUser(${email})`,
                    );
                }

                const variables = {
                    ad_soyad: `${v.data.ad || ''} ${v.data.soyad || ''}`.trim(),
                    unvan: v.data.unvan || '',
                    kurum_adi: institutionName,
                    kurum_adres: institutionAddress,
                    kurum_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
                    // Geri uyum: kayıtlı template'ler hâlâ {{kampus_*}} kullanıyor olabilir
                    kampus_adi: institutionName,
                    kampus_adres: institutionAddress,
                    kampus_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
                    telefon: v.data.telefon ? formatPhoneForSignature(v.data.telefon) : '',
                    eposta: email,
                };

                const html = renderTemplate(template.htmlContent, variables);
                await withRetry(
                    () => gmailLimiter.schedule(() => setSignature(email, html)),
                    log, `setSignature(${email})`,
                );
                signatureStateService.recordPush(email, payload.templateId, html, variables);

                succeeded++;
                if (rowNumber !== undefined) succeededItems.push({ email, rowNumber });
            } else if (emails) {
                email = emails[i];
                // Legacy path: Google'dan kullanıcı bilgisini çek + Campus DB lookup
                const userInfo = await withRetry(
                    () => adminLimiter.schedule(() => getUserInfo(email, adminEmail)),
                    log, `getUserInfo(${email})`,
                );
                const org = userInfo.organizations?.[0] || {};
                const phone = userInfo.phones?.[0]?.value || '';

                let institutionAddress = '';
                let institutionPhone = '';
                if (org.department) {
                    const c = institutionService.findByName(org.department);
                    if (c) {
                        institutionAddress = c.address || '';
                        institutionPhone = c.phone || '';
                    }
                }

                const variables = {
                    ad_soyad: `${userInfo.name?.givenName || ''} ${userInfo.name?.familyName || ''}`.trim(),
                    unvan: org.title || '',
                    kurum_adi: org.department || '',
                    kurum_adres: institutionAddress,
                    kurum_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
                    // Geri uyum: eski {{kampus_*}} token'ları kayıtlı template'lerde kalmış olabilir
                    kampus_adi: org.department || '',
                    kampus_adres: institutionAddress,
                    kampus_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
                    telefon: phone ? formatPhoneForSignature(phone) : '',
                    eposta: email,
                };

                const html = renderTemplate(template.htmlContent, variables);
                await withRetry(
                    () => gmailLimiter.schedule(() => setSignature(email, html)),
                    log, `setSignature(${email})`,
                );
                signatureStateService.recordPush(email, payload.templateId, html, variables);

                succeeded++;
                succeededItems.push({ email, rowNumber: i + 1 });
            } else {
                throw new Error('payload.rows veya payload.emails gerekli');
            }
        } catch (err: any) {
            failed++;
            const step = err?.message?.toLowerCase().includes('signature') ? 'push_signature' : 'patch_profile';
            failedItems.push({
                email,
                rowNumber: rowNumber ?? i + 1,
                step,
                error: err?.message || String(err),
            });
            log.error(`Signature push failed for ${email}`, err?.message);
        }

        const now = Date.now();

        // DB batch update + executionReport snapshot (stall recovery için item detayları korunur)
        if (i % DB_BATCH_SIZE === 0 || now - lastDbUpdate > DB_BATCH_INTERVAL_MS) {
            ctx.saveProgress({ progress: i + 1, succeeded, failed });
            ctx.setReport({
                totalProcessed: succeeded + failed,
                successCount: succeeded,
                failedCount: failed,
                succeededItems,
                failedItems,
                executedAt: new Date().toISOString(),
            });
            lastDbUpdate = now;
        }

        // Progress event debounce
        if (now - lastEmit > PROGRESS_DEBOUNCE_MS) {
            ctx.emitProgress({ progress: i + 1, total, succeeded, failed, currentUser: email });
            lastEmit = now;
        }
    }

    // Final flush
    ctx.saveProgress({ progress: total, succeeded, failed });

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const totalProcessed = succeeded + failed;
    const executionReport: JobExecutionReport = {
        totalProcessed,
        successCount: succeeded,
        failedCount: failed,
        succeededItems,
        failedItems,
        executedAt: new Date().toISOString(),
        timing: {
            startedAt: new Date(startedAt).toISOString(),
            completedAt: new Date(completedAt).toISOString(),
            durationMs,
            avgItemMs: totalProcessed > 0 ? Math.round(durationMs / totalProcessed) : 0,
            throughputPerSec: durationMs > 0 ? +(totalProcessed / (durationMs / 1000)).toFixed(2) : 0,
        },
    };

    return { executionReport, status: failed > 0 && succeeded === 0 ? 'FAILED' : 'COMPLETED' };
}

export function registerSignaturePushWorker(): void {
    jobRunner.registerHandler('BULK_SIGNATURE_PUSH', processJob);
}
