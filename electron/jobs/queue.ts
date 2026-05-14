import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import type { JobExecutionReport, JobRecord, JobStatus, JobType } from './types';

interface JobDbRow {
    id: string;
    type: string;
    status: string;
    payload: string;
    result: string | null;
    execution_report: string | null;
    progress: number;
    total: number;
    succeeded: number;
    failed: number;
    created_by: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
}

function toApi(row: JobDbRow): JobRecord {
    return {
        id: row.id,
        type: row.type as JobType,
        status: row.status as JobStatus,
        payload: row.payload ? JSON.parse(row.payload) : null,
        result: row.result ? JSON.parse(row.result) : null,
        executionReport: row.execution_report ? JSON.parse(row.execution_report) : null,
        progress: row.progress,
        total: row.total,
        succeeded: row.succeeded,
        failed: row.failed,
        createdBy: row.created_by,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        cancelledAt: row.cancelled_at,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

export const jobQueue = {
    enqueue(input: { type: JobType; payload: any; total: number; createdBy: string }): JobRecord {
        const id = randomUUID();
        getDb()
            .prepare(
                'INSERT INTO jobs (id, type, status, payload, total, created_by) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run(id, input.type, 'PENDING', JSON.stringify(input.payload), input.total, input.createdBy);
        return this.get(id)!;
    },

    get(id: string): JobRecord | null {
        const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobDbRow | undefined;
        return row ? toApi(row) : null;
    },

    list(filters: {
        status?: string;
        type?: string;
        createdBy?: string;
        limit?: number;
        page?: number;
        pageSize?: number;
    } = {}): JobRecord[] | { jobs: JobRecord[]; total: number; page: number; pageSize: number } {
        const where: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            const statuses = filters.status.split(',').map((s) => s.trim()).filter(Boolean);
            if (statuses.length > 0) {
                where.push(`status IN (${statuses.map(() => '?').join(',')})`);
                params.push(...statuses);
            }
        }
        if (filters.type) {
            where.push('type = ?');
            params.push(filters.type);
        }
        if (filters.createdBy) {
            where.push('created_by = ?');
            params.push(filters.createdBy);
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        if (filters.page !== undefined && filters.pageSize !== undefined) {
            const total = (getDb()
                .prepare(`SELECT COUNT(*) as c FROM jobs ${whereClause}`)
                .get(...params) as { c: number }).c;
            const offset = (filters.page - 1) * filters.pageSize;
            const rows = getDb()
                .prepare(
                    `SELECT * FROM jobs ${whereClause} ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`
                )
                .all(...params, filters.pageSize, offset) as JobDbRow[];
            return { jobs: rows.map(toApi), total, page: filters.page, pageSize: filters.pageSize };
        }

        const limit = filters.limit ?? 100;
        const rows = getDb()
            .prepare(
                `SELECT * FROM jobs ${whereClause} ORDER BY datetime(created_at) DESC LIMIT ?`
            )
            .all(...params, limit) as JobDbRow[];
        return rows.map(toApi);
    },

    listByStatus(statuses: JobStatus[]): JobRecord[] {
        if (statuses.length === 0) return [];
        const rows = getDb()
            .prepare(
                `SELECT * FROM jobs WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY datetime(created_at) ASC`
            )
            .all(...statuses) as JobDbRow[];
        return rows.map(toApi);
    },

    markRunning(id: string): void {
        getDb()
            .prepare("UPDATE jobs SET status = 'RUNNING', started_at = COALESCE(started_at, ?) WHERE id = ?")
            .run(nowIso(), id);
    },

    setTotal(id: string, total: number): void {
        getDb().prepare('UPDATE jobs SET total = ? WHERE id = ?').run(total, id);
    },

    updateProgress(id: string, patch: { progress?: number; succeeded?: number; failed?: number }): void {
        const fields: string[] = [];
        const params: any[] = [];
        if (patch.progress !== undefined) { fields.push('progress = ?'); params.push(patch.progress); }
        if (patch.succeeded !== undefined) { fields.push('succeeded = ?'); params.push(patch.succeeded); }
        if (patch.failed !== undefined) { fields.push('failed = ?'); params.push(patch.failed); }
        if (fields.length === 0) return;
        params.push(id);
        getDb().prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    },

    complete(id: string, status: 'COMPLETED' | 'FAILED', report: JobExecutionReport | null): void {
        getDb()
            .prepare(
                'UPDATE jobs SET status = ?, completed_at = ?, execution_report = ? WHERE id = ?'
            )
            .run(status, nowIso(), report ? JSON.stringify(report) : null, id);
    },

    cancel(id: string): JobRecord | null {
        const row = this.get(id);
        if (!row) return null;
        if (row.status === 'COMPLETED' || row.status === 'FAILED' || row.status === 'CANCELLED') return row;
        getDb()
            .prepare(
                "UPDATE jobs SET status = 'CANCELLED', cancelled_at = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?"
            )
            .run(nowIso(), nowIso(), id);
        return this.get(id);
    },

    setExecutionReport(id: string, report: JobExecutionReport): void {
        getDb()
            .prepare('UPDATE jobs SET execution_report = ? WHERE id = ?')
            .run(JSON.stringify(report), id);
    },
};
