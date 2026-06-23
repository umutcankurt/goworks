import { BrowserWindow, powerSaveBlocker } from 'electron';
import { jobQueue } from './queue';
import type { JobRecord, ProgressEventPayload } from './types';
import { getLogger } from '../services/logger';
import { getDb } from '../db';
import { vaultManager } from '../services/vault-manager';

type WorkerHandler = (
    job: JobRecord,
    ctx: WorkerContext,
) => Promise<{ executionReport: import('./types').JobExecutionReport; status: 'COMPLETED' | 'FAILED' }>;

export interface WorkerContext {
    isCancelled: () => boolean;
    emitProgress: (patch: Partial<ProgressEventPayload>) => void;
    saveProgress: (patch: { progress?: number; succeeded?: number; failed?: number }) => void;
    setReport: (report: import('./types').JobExecutionReport) => void;
}

class JobRunner {
    private cancelled = new Set<string>();
    private running = new Set<string>();
    private handlers = new Map<string, WorkerHandler>();
    // per-type concurrency
    private concurrency = new Map<string, number>([
        ['BULK_SIGNATURE_PUSH', 3],
        ['BULK_SUSPEND', 1],
        ['BULK_DELETE', 1],
        ['SIGNATURE_AUDIT', 1],
        ['BULK_GROUP_ADD', 1],
    ]);
    private activeByType = new Map<string, number>();
    private mainWindow: BrowserWindow | null = null;
    private dispatchScheduled = false;
    // While any job runs, prevent the OS from suspending the app so long bulk
    // operations aren't interrupted if the user walks away (sleep/idle).
    private powerBlockerId: number | null = null;

    setWindow(win: BrowserWindow | null) {
        this.mainWindow = win;
    }

    registerHandler(type: string, handler: WorkerHandler) {
        this.handlers.set(type, handler);
    }

    cancel(id: string): boolean {
        const job = jobQueue.cancel(id);
        if (!job) return false;
        this.cancelled.add(id);
        return true;
    }

    /** Number of jobs currently executing — used by the vault Graceful Lock to
     *  decide when it is safe to zeroize the DEK. */
    getRunningCount(): number {
        return this.running.size;
    }

    /**
     * Called on application startup:
     * - Leaves PENDING jobs in the queue
     * - Resumes RUNNING jobs (left over from a previous session that closed before completing) by moving them back to PENDING
     * - Stale execution: RUNNING but this session never actually ran them → PENDING
     */
    resumeOnStartup(): void {
        const log = getLogger();
        const stale = jobQueue.listByStatus(['RUNNING']);
        for (const job of stale) {
            log.warn(`[runner] Resuming stale RUNNING job ${job.id} (progress=${job.progress}/${job.total})`);
            // Preserve progress, just move status back to PENDING so dispatch picks it up again
            try {
                getDb().prepare("UPDATE jobs SET status = 'PENDING' WHERE id = ?").run(job.id);
            } catch (e) {
                log.error('Resume status reset failed', e);
            }
        }
        this.scheduleDispatch();
    }

    enqueueAndStart(record: JobRecord): void {
        this.scheduleDispatch();
        void record;
    }

    /** Public nudge to (re)run the dispatch loop — e.g. after the vault unlocks. */
    resumeDispatch(): void {
        this.scheduleDispatch();
    }

    private scheduleDispatch() {
        if (this.dispatchScheduled) return;
        this.dispatchScheduled = true;
        setImmediate(() => {
            this.dispatchScheduled = false;
            this.dispatch();
        });
    }

    private dispatch() {
        // Vault unlock-gate: while the vault is locked (fresh startup before
        // unlock, or after an idle soft-lock) do NOT start new jobs — they wait in
        // PENDING until the master password is entered. Jobs already RUNNING are
        // unaffected (Graceful Lock keeps the DEK alive until they finish).
        if (vaultManager.isLocked()) return;
        const pending = jobQueue.listByStatus(['PENDING']);
        for (const job of pending) {
            if (this.running.has(job.id)) continue;
            const max = this.concurrency.get(job.type) ?? 1;
            const active = this.activeByType.get(job.type) ?? 0;
            if (active >= max) continue;
            const handler = this.handlers.get(job.type);
            if (!handler) {
                getLogger().warn(`[runner] No handler for job type ${job.type}`);
                continue;
            }
            this.startJob(job, handler);
        }
    }

    private acquirePowerBlocker(): void {
        if (this.powerBlockerId !== null) return;
        try {
            // 'prevent-app-suspension' keeps the process running (and the system
            // awake on AC) without forcing the display to stay on.
            this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
            getLogger().info('[runner] powerSaveBlocker started (job running).');
        } catch (e) {
            getLogger().warn('[runner] powerSaveBlocker start failed', e);
            this.powerBlockerId = null;
        }
    }

    private releasePowerBlocker(): void {
        if (this.powerBlockerId === null) return;
        try {
            if (powerSaveBlocker.isStarted(this.powerBlockerId)) {
                powerSaveBlocker.stop(this.powerBlockerId);
            }
            getLogger().info('[runner] powerSaveBlocker stopped (queue idle).');
        } catch (e) {
            getLogger().warn('[runner] powerSaveBlocker stop failed', e);
        } finally {
            this.powerBlockerId = null;
        }
    }

    private startJob(job: JobRecord, handler: WorkerHandler) {
        this.running.add(job.id);
        this.activeByType.set(job.type, (this.activeByType.get(job.type) ?? 0) + 1);
        this.acquirePowerBlocker();
        jobQueue.markRunning(job.id);

        const ctx: WorkerContext = {
            isCancelled: () => this.cancelled.has(job.id),
            emitProgress: (patch) => this.emit({ jobId: job.id, total: job.total, progress: 0, succeeded: 0, failed: 0, ...patch } as ProgressEventPayload),
            saveProgress: (patch) => jobQueue.updateProgress(job.id, patch),
            setReport: (report) => jobQueue.setExecutionReport(job.id, report),
        };

        // Resume case: payload is already persisted; the handler can inspect job.progress
        const fresh = jobQueue.get(job.id) ?? job;

        handler(fresh, ctx)
            .then((result) => {
                const final = this.cancelled.has(job.id) ? 'CANCELLED' : result.status;
                if (final === 'CANCELLED') {
                    // already cancelled in queue
                    jobQueue.setExecutionReport(job.id, result.executionReport);
                } else {
                    jobQueue.complete(job.id, final, result.executionReport);
                }
                this.emit({
                    jobId: job.id,
                    total: result.executionReport.totalProcessed,
                    progress: result.executionReport.totalProcessed,
                    succeeded: result.executionReport.successCount,
                    failed: result.executionReport.failedCount,
                });
                this.sendDoneEvent(job.id, final);
                this.fireCompletionEmail(job.id);
            })
            .catch((err) => {
                getLogger().error(`[runner] Job ${job.id} crashed`, err);
                jobQueue.complete(job.id, 'FAILED', null);
                this.sendDoneEvent(job.id, 'FAILED');
                this.fireCompletionEmail(job.id);
            })
            .finally(() => {
                this.running.delete(job.id);
                this.cancelled.delete(job.id);
                this.activeByType.set(job.type, Math.max(0, (this.activeByType.get(job.type) ?? 1) - 1));
                // Release the power blocker once the queue is fully idle.
                if (this.running.size === 0) this.releasePowerBlocker();
                this.scheduleDispatch();
                // Graceful Lock: if a soft-lock is waiting for jobs to drain,
                // zeroize the DEK now that this job (maybe the last one) settled.
                vaultManager.onJobSettled();
            });
    }

    private emit(payload: ProgressEventPayload) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        try {
            this.mainWindow.webContents.send('jobs:progress', payload);
        } catch (e) {
            getLogger().error('[runner] Progress emit failed', e);
        }
    }

    private sendDoneEvent(jobId: string, status: string) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        try {
            this.mainWindow.webContents.send('jobs:done', { jobId, status });
        } catch (e) {
            getLogger().error('[runner] Done emit failed', e);
        }
    }

    private fireCompletionEmail(jobId: string): void {
        // Lazy import: keep the email service from creating a circular import with this file.
        import('../services/email-notification-service')
            .then(({ sendJobCompletionEmail }) => sendJobCompletionEmail(jobId))
            .catch((err) => getLogger().error('[runner] Email send failed', err));
    }
}

export const jobRunner = new JobRunner();
