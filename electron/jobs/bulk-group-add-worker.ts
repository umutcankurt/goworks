import { jobRunner, type WorkerContext } from './runner';
import type { JobExecutionReport, JobRecord } from './types';
import { withRetry } from '../services/retry';
import { getLogger } from '../services/logger';
import { getAuthClient } from '../services/auth-context';
import { addSingleMember } from '../services/groups-service';
import type { ValidatedRow } from '../services/csv-analysis';
import type { GroupRole } from '../types';
import type { OAuth2Client } from 'google-auth-library';

const DB_BATCH_SIZE = 10;
const DB_BATCH_INTERVAL_MS = 2000;
const PROGRESS_DEBOUNCE_MS = 500;
// Hard upper bound per row — if the withRetry (3 × + backoff) chain hangs, this
// watchdog throws so the loop can move on.
const ROW_WATCHDOG_MS = 60_000;

function withWatchdog<T>(promise: Promise<T>, ms: number, context: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Watchdog: ${context} did not complete within ${ms}ms`)),
            ms,
        );
        timer.unref();
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

/** Normalizes a free-form role cell to a valid GroupRole; empty/unknown → MEMBER. */
function normalizeRole(raw: string | undefined): GroupRole {
    const v = (raw || '').trim().toLowerCase();
    if (v === 'owner' || v === 'sahip') return 'OWNER';
    if (v === 'manager' || v === 'yönetici' || v === 'yonetici') return 'MANAGER';
    return 'MEMBER';
}

/** True when the API error means the user is already a member (idempotent success). */
function isAlreadyMember(err: any): boolean {
    const status = err?.code || err?.response?.status;
    if (status === 409) return true;
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('already exists') || msg.includes('member already') || msg.includes('duplicate');
}

interface BulkGroupAddPayload {
    rows?: ValidatedRow[];
}

async function processJob(
    job: JobRecord,
    ctx: WorkerContext,
): Promise<{ executionReport: JobExecutionReport; status: 'COMPLETED' | 'FAILED' }> {
    const log = getLogger();
    const payload = (job.payload || {}) as BulkGroupAddPayload;
    const rows = payload.rows || [];
    const total = rows.length;

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

    // Group operations run with the admin's OAuth token (audit actor = admin).
    // Resolve once up front; if there is no active session, fail the whole job
    // with a clear error rather than failing every row.
    let auth: OAuth2Client;
    try {
        auth = getAuthClient();
    } catch (err: any) {
        log.error(`Job ${job.id} (BULK_GROUP_ADD) has no active admin session`, err?.message);
        const executionReport: JobExecutionReport = {
            totalProcessed: 0,
            successCount: succeeded,
            failedCount: failed,
            succeededItems,
            failedItems,
            executedAt: new Date().toISOString(),
        };
        return { executionReport, status: 'FAILED' };
    }

    const startIndex = Math.min(job.progress || 0, total); // resume support

    let lastDbUpdate = Date.now();
    let lastEmit = 0;

    for (let i = startIndex; i < rows.length; i++) {
        if (ctx.isCancelled()) {
            log.info(`Job ${job.id} cancelled at ${i}/${total}`);
            break;
        }

        const data = rows[i]?.data || {};
        const groupKey = (data.grup_email || '').trim();
        const memberEmail = (data.email || '').trim();
        const role = normalizeRole(data.rol);

        try {
            await withWatchdog(
                withRetry(
                    () => addSingleMember(auth, groupKey, { email: memberEmail, role }),
                    log, `addSingleMember(${groupKey},${memberEmail})`,
                ),
                ROW_WATCHDOG_MS,
                `BULK_GROUP_ADD(${groupKey},${memberEmail})`,
            );
            succeeded++;
            succeededItems.push({ email: memberEmail, rowNumber: i + 1 });
        } catch (err: any) {
            if (isAlreadyMember(err)) {
                // Already a member — count as an idempotent success.
                succeeded++;
                succeededItems.push({ email: memberEmail, rowNumber: i + 1 });
                log.info(`Already a member of ${groupKey}: ${memberEmail}`);
            } else {
                failed++;
                failedItems.push({
                    email: memberEmail,
                    rowNumber: i + 1,
                    step: 'add_to_group',
                    error: `${groupKey}: ${err?.message || String(err)}`,
                });
                log.error(`Add to group failed for ${memberEmail} → ${groupKey}`, err?.message);
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
            ctx.emitProgress({ progress: i + 1, total, succeeded, failed, currentUser: memberEmail });
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

export function registerBulkGroupAddWorker(): void {
    jobRunner.registerHandler('BULK_GROUP_ADD', processJob);
}
