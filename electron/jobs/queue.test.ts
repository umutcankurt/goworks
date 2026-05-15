import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const testDbHolder = vi.hoisted(() => ({ db: null as Database.Database | null }));

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp/goworks-test', isPackaged: false },
}));

vi.mock('../db', () => ({
    getDb: () => testDbHolder.db!,
}));

import { jobQueue } from './queue';

const SCHEMA_PATH = path.join(process.cwd(), 'electron', 'db', 'schema.sql');

beforeEach(() => {
    testDbHolder.db = new Database(':memory:');
    const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
    testDbHolder.db.exec(schemaSql);
});

describe('jobQueue', () => {
    describe('enqueue', () => {
        it('PENDING durumunda yeni bir job yaratır', () => {
            const job = jobQueue.enqueue({
                type: 'BULK_SUSPEND',
                payload: { rows: [{ email: 'a@b.com' }] },
                total: 1,
                createdBy: 'admin@example.com',
            });
            expect(job.status).toBe('PENDING');
            expect(job.type).toBe('BULK_SUSPEND');
            expect(job.total).toBe(1);
            expect(job.progress).toBe(0);
            expect(job.succeeded).toBe(0);
            expect(job.failed).toBe(0);
            expect(job.createdBy).toBe('admin@example.com');
            expect(job.startedAt).toBeNull();
            expect(job.completedAt).toBeNull();
            expect(job.payload).toEqual({ rows: [{ email: 'a@b.com' }] });
        });

        it('UUID id atar — her job benzersiz olur', () => {
            const j1 = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 0, createdBy: 'u' });
            const j2 = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 0, createdBy: 'u' });
            expect(j1.id).not.toBe(j2.id);
            expect(j1.id).toMatch(/^[0-9a-f-]{36}$/);
        });
    });

    describe('get', () => {
        it('var olan job\'u döner', () => {
            const created = jobQueue.enqueue({ type: 'BULK_DELETE', payload: { x: 1 }, total: 5, createdBy: 'u' });
            const fetched = jobQueue.get(created.id);
            expect(fetched).not.toBeNull();
            expect(fetched!.id).toBe(created.id);
            expect(fetched!.payload).toEqual({ x: 1 });
        });

        it('bilinmeyen id için null döner', () => {
            expect(jobQueue.get('non-existent-id')).toBeNull();
        });
    });

    describe('state machine: PENDING → RUNNING → COMPLETED', () => {
        it('markRunning durumu RUNNING\'e çevirir ve started_at set eder', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.markRunning(job.id);
            const after = jobQueue.get(job.id)!;
            expect(after.status).toBe('RUNNING');
            expect(after.startedAt).toBeTruthy();
            expect(after.completedAt).toBeNull();
        });

        it('markRunning idempotent — ikinci çağrı started_at\'i değiştirmez', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.markRunning(job.id);
            const first = jobQueue.get(job.id)!.startedAt;
            jobQueue.markRunning(job.id);
            expect(jobQueue.get(job.id)!.startedAt).toBe(first);
        });

        it('complete COMPLETED durumuna geçer ve execution report\'u saklar', () => {
            const job = jobQueue.enqueue({ type: 'BULK_SUSPEND', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.markRunning(job.id);
            const report = {
                totalProcessed: 1,
                successCount: 1,
                failedCount: 0,
                succeededItems: [{ email: 'a@b.com', rowNumber: 1 }],
                failedItems: [],
                executedAt: '2026-05-15T12:00:00.000Z',
            };
            jobQueue.complete(job.id, 'COMPLETED', report);
            const after = jobQueue.get(job.id)!;
            expect(after.status).toBe('COMPLETED');
            expect(after.completedAt).toBeTruthy();
            expect(after.executionReport).toEqual(report);
        });

        it('complete FAILED durumuna geçer', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.complete(job.id, 'FAILED', null);
            const after = jobQueue.get(job.id)!;
            expect(after.status).toBe('FAILED');
            expect(after.executionReport).toBeNull();
        });
    });

    describe('cancel', () => {
        it('PENDING job CANCELLED durumuna geçer', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            const cancelled = jobQueue.cancel(job.id);
            expect(cancelled!.status).toBe('CANCELLED');
            expect(cancelled!.cancelledAt).toBeTruthy();
            expect(cancelled!.completedAt).toBeTruthy();
        });

        it('RUNNING job CANCELLED\'a geçer', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.markRunning(job.id);
            const cancelled = jobQueue.cancel(job.id);
            expect(cancelled!.status).toBe('CANCELLED');
        });

        it('COMPLETED job cancel edilemez — status değişmez', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.complete(job.id, 'COMPLETED', null);
            const result = jobQueue.cancel(job.id);
            expect(result!.status).toBe('COMPLETED');
        });

        it('FAILED job cancel edilemez', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.complete(job.id, 'FAILED', null);
            const result = jobQueue.cancel(job.id);
            expect(result!.status).toBe('FAILED');
        });

        it('bilinmeyen job için null döner', () => {
            expect(jobQueue.cancel('non-existent')).toBeNull();
        });
    });

    describe('updateProgress', () => {
        it('progress, succeeded, failed alanlarını günceller', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 10, createdBy: 'u' });
            jobQueue.updateProgress(job.id, { progress: 5, succeeded: 4, failed: 1 });
            const after = jobQueue.get(job.id)!;
            expect(after.progress).toBe(5);
            expect(after.succeeded).toBe(4);
            expect(after.failed).toBe(1);
        });

        it('boş patch no-op davranır', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 10, createdBy: 'u' });
            jobQueue.updateProgress(job.id, {});
            const after = jobQueue.get(job.id)!;
            expect(after.progress).toBe(0);
        });

        it('kısmi patch sadece verilen alanları günceller', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 10, createdBy: 'u' });
            jobQueue.updateProgress(job.id, { progress: 3 });
            jobQueue.updateProgress(job.id, { succeeded: 2 });
            const after = jobQueue.get(job.id)!;
            expect(after.progress).toBe(3);
            expect(after.succeeded).toBe(2);
            expect(after.failed).toBe(0);
        });
    });

    describe('list & filtering', () => {
        beforeEach(() => {
            jobQueue.enqueue({ type: 'BULK_SUSPEND', payload: {}, total: 1, createdBy: 'a@x' });
            jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'a@x' });
            jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'b@x' });
        });

        it('createdBy ile filtreler', () => {
            const result = jobQueue.list({ createdBy: 'a@x' }) as ReturnType<typeof jobQueue.enqueue>[];
            expect(result).toHaveLength(2);
            expect(result.every((j) => j.createdBy === 'a@x')).toBe(true);
        });

        it('type ile filtreler', () => {
            const result = jobQueue.list({ type: 'BULK_DELETE' }) as ReturnType<typeof jobQueue.enqueue>[];
            expect(result).toHaveLength(2);
            expect(result.every((j) => j.type === 'BULK_DELETE')).toBe(true);
        });

        it('status virgül-ayrılmış multi-value filtre destekler', () => {
            const j = jobQueue.enqueue({ type: 'BULK_SUSPEND', payload: {}, total: 1, createdBy: 'c@x' });
            jobQueue.complete(j.id, 'COMPLETED', null);
            const result = jobQueue.list({ status: 'COMPLETED,FAILED' }) as ReturnType<typeof jobQueue.enqueue>[];
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(j.id);
        });

        it('pagination ile total + jobs döner', () => {
            const paged = jobQueue.list({ page: 1, pageSize: 2 }) as {
                jobs: ReturnType<typeof jobQueue.enqueue>[];
                total: number;
                page: number;
                pageSize: number;
            };
            expect(paged.total).toBe(3);
            expect(paged.jobs).toHaveLength(2);
            expect(paged.page).toBe(1);
            expect(paged.pageSize).toBe(2);
        });
    });

    describe('listByStatus', () => {
        it('verilen status\'lardaki job\'ları döner', () => {
            const a = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            const b = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            jobQueue.markRunning(b.id);
            const pending = jobQueue.listByStatus(['PENDING']);
            expect(pending).toHaveLength(1);
            expect(pending[0].id).toBe(a.id);
            const running = jobQueue.listByStatus(['RUNNING']);
            expect(running[0].id).toBe(b.id);
        });

        it('boş status listesi için boş array döner', () => {
            expect(jobQueue.listByStatus([])).toEqual([]);
        });
    });

    describe('setTotal & setExecutionReport', () => {
        it('setTotal total\'ı günceller', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 0, createdBy: 'u' });
            jobQueue.setTotal(job.id, 42);
            expect(jobQueue.get(job.id)!.total).toBe(42);
        });

        it('setExecutionReport raporu saklar', () => {
            const job = jobQueue.enqueue({ type: 'BULK_DELETE', payload: {}, total: 1, createdBy: 'u' });
            const report = {
                totalProcessed: 1,
                successCount: 1,
                failedCount: 0,
                succeededItems: [],
                failedItems: [],
                executedAt: '2026-05-15T12:00:00.000Z',
            };
            jobQueue.setExecutionReport(job.id, report);
            expect(jobQueue.get(job.id)!.executionReport).toEqual(report);
        });
    });
});
