import Bottleneck from 'bottleneck';
import { getLogger } from './logger';

// Google Admin Directory API: a safe rate for bulk delete/suspend/signature operations.
// v0.7.2 fix: the Reservoir + reservoirRefreshInterval combination stopped dispatching
// the refresh timer after ~85 requests (Bottleneck reservoir-stall bug).
// minTime: 200ms (~5 req/s) alone provides a sufficient rate limit.
export const adminLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 200,
});

adminLimiter.on('error', (err) => {
    getLogger().error('adminLimiter error', err);
});
adminLimiter.on('failed', (err, jobInfo) => {
    getLogger().warn('adminLimiter job failed', err?.message, jobInfo?.options);
});

// Gmail API (Service Account + DWD): signature set/get
// BASE profile — a reservoir is kept for the Gmail per-user quota (250 quota units/sec);
// the reservoir-stall fix from adminLimiter is NOT APPLIED HERE (Gmail-specific, the pattern
// from the old server code is preserved exactly).
export const gmailLimiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: 12,
    reservoir: 80,
    reservoirRefreshAmount: 80,
    reservoirRefreshInterval: 1000,
});
