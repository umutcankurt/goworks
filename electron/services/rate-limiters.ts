import Bottleneck from 'bottleneck';
import { getLogger } from './logger';

// Google Admin Directory API: Bulk silme/suspend/imza işlemleri için güvenli hız.
// v0.7.2 fix: Reservoir + reservoirRefreshInterval kombinasyonu ~85 istek sonrası
// refresh timer'ı dispatch etmeyi kesiyordu (Bottleneck reservoir-stall bug).
// minTime: 200ms (~5 req/s) tek başına yeterli rate limit sağlıyor.
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

// Gmail API (Service Account + DWD): imza set/get
// BASE profil — Gmail per-user quota (250 quota units/sec) için reservoir tutuluyor;
// adminLimiter'daki reservoir-stall fix BURADA UYGULANMAZ (Gmail spesifik, eski sunucu
// kodundaki desen birebir korunuyor).
export const gmailLimiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: 12,
    reservoir: 80,
    reservoirRefreshAmount: 80,
    reservoirRefreshInterval: 1000,
});
