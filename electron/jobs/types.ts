export type JobType = 'BULK_SIGNATURE_PUSH' | 'BULK_SUSPEND' | 'BULK_DELETE' | 'SIGNATURE_AUDIT' | 'BULK_GROUP_ADD';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobRecord {
    id: string;
    type: JobType;
    status: JobStatus;
    payload: any;
    result: { errors?: Array<{ email: string; error: string }>; succeededEmails?: string[] } | null;
    executionReport: JobExecutionReport | null;
    progress: number;
    total: number;
    succeeded: number;
    failed: number;
    createdBy: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
}

export interface JobExecutionReport {
    totalProcessed: number;
    successCount: number;
    failedCount: number;
    succeededItems: Array<{ email: string; rowNumber: number }>;
    failedItems: Array<{ email: string; rowNumber: number; step: string; error: string }>;
    executedAt: string;
    timing?: {
        startedAt: string;
        completedAt: string;
        durationMs: number;
        avgItemMs: number;
        throughputPerSec: number;
    };
}

export interface ProgressEventPayload {
    jobId: string;
    total: number;
    progress: number;
    succeeded: number;
    failed: number;
    currentUser?: string;
    errors?: Array<{ user: string; error: string }>;
}
