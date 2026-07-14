// In-memory state for demo mode.
//
// Deliberately volatile: nothing is written to disk, SQLite or localStorage.
// Whatever you click, add or delete inside the prototype is gone on reload and
// the dataset is rebuilt from the fixture. That makes every screenshot run
// start from the exact same state.

import type { DemoDataset } from './data/build';
import type { ServerJob } from '../services/server-api';
import type { VaultState } from '../services/server-api';

type Listener = (event: unknown, payload: any) => void;

export class DemoStore {
    data: DemoDataset;
    vault: VaultState;
    /** Signature-audit results, keyed by the scan job that produced them. */
    auditItems = new Map<string, any[]>();
    private listeners = new Map<string, Set<Listener>>();
    private timers = new Set<ReturnType<typeof setInterval>>();
    private jobSeq = 3000;

    constructor(data: DemoDataset) {
        this.data = data;
        this.vault = {
            status: 'UNLOCKED',
            hardLockPending: false,
            googleReauthNeeded: false,
            pendingJobs: 0,
            corrupt: false,
            lockedUntil: 0,
        };
    }

    // --- event bus (mirrors the preload's on/off/emit contract) ---

    on(channel: string, listener: Listener): void {
        if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
        this.listeners.get(channel)!.add(listener);
    }

    off(channel: string, listener: Listener): void {
        this.listeners.get(channel)?.delete(listener);
    }

    /** Electron calls listeners as (event, payload) — keep the same shape. */
    emit(channel: string, payload?: unknown): void {
        for (const listener of this.listeners.get(channel) ?? []) {
            listener({}, payload);
        }
    }

    // --- helpers ---

    nextJobId(): string {
        this.jobSeq += 1;
        return `job-${this.jobSeq}`;
    }

    findUser(userKey: string) {
        const key = String(userKey ?? '').toLowerCase();
        return this.data.users.find(
            (u) => u.primaryEmail.toLowerCase() === key || u.id === userKey,
        );
    }

    findGroup(groupKey: string) {
        const key = String(groupKey ?? '').toLowerCase();
        return this.data.groups.find(
            (g) => g.email.toLowerCase() === key || g.id === groupKey,
        );
    }

    /**
     * Drives a fake job to completion, emitting the same `jobs:progress` /
     * `jobs:done` events the real runner emits. Without these the bulk and
     * audit screens sit at 0% forever.
     */
    runJob(job: ServerJob, emails: string[], onDone?: (job: ServerJob) => void): void {
        const total = Math.max(emails.length, 1);
        let index = 0;

        const tick = () => {
            // Paced so a running job stays on screen long enough to be screenshotted:
            // at most ~30 ticks, so a small job advances one row at a time.
            const batch = Math.min(total, index + Math.max(1, Math.ceil(total / 30)));
            for (; index < batch; index++) {
                // Every 17th item fails, so the reports have both outcomes.
                const failed = index % 17 === 16;
                if (failed) {
                    job.failed += 1;
                    job.result?.errors.push({
                        email: emails[index],
                        error: this.data.profile.jobErrors[job.failed % this.data.profile.jobErrors.length],
                    });
                } else {
                    job.succeeded += 1;
                    job.result?.succeededEmails?.push(emails[index]);
                }
            }
            job.progress = index;

            this.emit('jobs:progress', {
                jobId: job.id,
                total: job.total,
                progress: job.progress,
                succeeded: job.succeeded,
                failed: job.failed,
                currentUser: emails[Math.min(index, total - 1)] ?? '',
                // The progress event names the address `user`, while the stored
                // job result names it `email` — translate, or the UI renders a
                // bare ": <error>" with no address.
                errors: (job.result?.errors ?? []).map((e) => ({ user: e.email, error: e.error })),
            });

            if (index >= total) {
                clearInterval(timer);
                this.timers.delete(timer);
                if (job.status === 'RUNNING') {
                    job.status = 'COMPLETED';
                    job.completedAt = new Date().toISOString();
                    job.executionReport = {
                        totalProcessed: job.total,
                        successCount: job.succeeded,
                        failedCount: job.failed,
                        succeededItems: (job.result?.succeededEmails ?? []).map((email, i) => ({
                            email,
                            rowNumber: i + 1,
                        })),
                        failedItems: (job.result?.errors ?? []).map((e, i) => ({
                            email: e.email,
                            rowNumber: i + 1,
                            step: 'gmail.settings.sendAs.patch',
                            error: e.error,
                        })),
                        executedAt: new Date().toISOString(),
                    };
                }
                onDone?.(job);
                this.emit('jobs:done', { jobId: job.id, status: job.status });
            }
        };

        // ~1.2s per step: slow enough that the progress UI is actually
        // observable (a real bulk run takes minutes), fast enough not to bore.
        const timer = setInterval(tick, 1200);
        this.timers.add(timer);
    }

    cancelJob(jobId: string): boolean {
        const job = this.data.jobs.find((j) => j.id === jobId);
        if (!job || job.status !== 'RUNNING') return false;
        job.status = 'CANCELLED';
        job.cancelledAt = new Date().toISOString();
        return true;
    }

    dispose(): void {
        for (const timer of this.timers) clearInterval(timer);
        this.timers.clear();
        this.listeners.clear();
    }
}
