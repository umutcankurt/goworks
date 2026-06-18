import { jobRunner, type WorkerContext } from './runner';
import type { JobExecutionReport, JobRecord } from './types';
import { adminLimiter } from '../services/rate-limiters';
import { withRetry } from '../services/retry';
import { getLogger } from '../services/logger';
import { suspendUser, deleteUser } from '../services/google-admin-sa';

const DB_BATCH_SIZE = 10;
const DB_BATCH_INTERVAL_MS = 2000;
const PROGRESS_DEBOUNCE_MS = 500;
// Hard upper bound per email — if the withTimeout (30s) + withRetry (3 × 30s + backoff) chain
// hangs, this watchdog kicks in and throws an error.
const EMAIL_WATCHDOG_MS = 60_000;

function withWatchdog<T>(promise: Promise<T>, ms: number, context: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Watchdog: ${context} ${ms}ms içinde tamamlanamadı`)),
            ms,
        );
        timer.unref();
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

interface BulkActionPayload {
    emails: string[];
}

async function processJob(
    job: JobRecord,
    ctx: WorkerContext,
): Promise<{ executionReport: JobExecutionReport; status: 'COMPLETED' | 'FAILED' }> {
    const log = getLogger();
    const adminEmail = job.createdBy;
    const payload = (job.payload || {}) as BulkActionPayload;
    const emails = payload.emails || [];
    const total = emails.length;

    const startedAt = Date.now();
    let succeeded = job.succeeded || 0;
    let failed = job.failed || 0;
    // Stall recovery: load item details carried over from previous session batch flushes.
    const prevReport = job.executionReport;
    const succeededItems: JobExecutionReport['succeededItems'] = prevReport?.succeededItems
        ? [...prevReport.succeededItems]
        : [];
    const failedItems: JobExecutionReport['failedItems'] = prevReport?.failedItems
        ? [...prevReport.failedItems]
        : [];

    const startIndex = Math.min(job.progress || 0, total); // resume support

    let lastDbUpdate = Date.now();
    let lastEmit = 0;

    for (let i = startIndex; i < emails.length; i++) {
        if (ctx.isCancelled()) {
            log.info(`Job ${job.id} cancelled at ${i}/${total}`);
            break;
        }

        const email = emails[i];

        try {
            if (job.type === 'BULK_SUSPEND') {
                await withWatchdog(
                    withRetry(
                        () => adminLimiter.schedule(() => suspendUser(email, adminEmail)),
                        log, `suspendUser(${email})`,
                    ),
                    EMAIL_WATCHDOG_MS,
                    `BULK_SUSPEND(${email})`,
                );
            } else if (job.type === 'BULK_DELETE') {
                await withWatchdog(
                    withRetry(
                        () => adminLimiter.schedule(() => deleteUser(email, adminEmail)),
                        log, `deleteUser(${email})`,
                    ),
                    EMAIL_WATCHDOG_MS,
                    `BULK_DELETE(${email})`,
                );
            }
            succeeded++;
            succeededItems.push({ email, rowNumber: i + 1 });
        } catch (err: unknown) {
            // Extract a status code from a GaxiosError-like shape without assuming `any`.
            const status = typeof err === 'object' && err !== null
                ? ((err as { code?: number }).code ?? (err as { response?: { status?: number } }).response?.status)
                : undefined;
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (status === 404 && job.type === 'BULK_DELETE') {
                // User already deleted — count as an idempotent success
                succeeded++;
                succeededItems.push({ email, rowNumber: i + 1 });
                log.info(`User already deleted (404): ${email}`);
            } else {
                failed++;
                failedItems.push({
                    email,
                    rowNumber: i + 1,
                    step: job.type === 'BULK_SUSPEND' ? 'suspend' : 'delete',
                    error: errorMessage,
                });
                log.error(`Bulk ${job.type} failed for ${email}`, errorMessage);
            }
        }

        const now = Date.now();
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
        if (now - lastEmit > PROGRESS_DEBOUNCE_MS) {
            ctx.emitProgress({ progress: i + 1, total, succeeded, failed, currentUser: email });
            lastEmit = now;
        }
    }

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

export function registerBulkActionWorker(): void {
    jobRunner.registerHandler('BULK_SUSPEND', processJob);
    jobRunner.registerHandler('BULK_DELETE', processJob);
}
