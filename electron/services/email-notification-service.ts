import Papa from 'papaparse';
import { GoogleAuth } from 'google-auth-library';
import { getGoogle } from '../google-lazy';
import { getServiceAccountKeyPath, getStatus } from '../secrets/service-account-loader';
import { gmailLimiter } from './rate-limiters';
import { getLogger } from './logger';
import { jobQueue } from '../jobs/queue';
import type { JobRecord } from '../jobs/types';

const sendAuthCache = new Map<string, GoogleAuth>();

function getSendAuth(adminEmail: string): GoogleAuth {
    const existing = sendAuthCache.get(adminEmail);
    if (existing) return existing;
    if (!getStatus().configured) {
        throw new Error('Service Account yapılandırılmamış (gmail.send DWD için gerekli)');
    }
    const auth = new GoogleAuth({
        keyFile: getServiceAccountKeyPath(),
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
        clientOptions: { subject: adminEmail },
    });
    sendAuthCache.set(adminEmail, auth);
    return auth;
}

export function clearEmailNotificationCache(): void {
    sendAuthCache.clear();
}

const JOB_TYPE_LABELS: Record<string, string> = {
    BULK_SUSPEND: 'Toplu Askıya Alma',
    BULK_DELETE: 'Toplu Silme',
    BULK_SIGNATURE_PUSH: 'Toplu İmza Gönderme',
};

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}sa`);
    if (m % 60 > 0) parts.push(`${m % 60}dk`);
    parts.push(`${s % 60}sn`);
    return parts.join(' ');
}

function formatDate(d: Date): string {
    return d.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Istanbul',
    });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getJobStatusInfo(job: JobRecord): { headerColor: string; statusText: string } {
    const label = JOB_TYPE_LABELS[job.type] || job.type;
    if (job.status === 'FAILED') return { headerColor: '#a83a3a', statusText: `${label} Tamamlanamadı` };
    if (job.status === 'CANCELLED') return { headerColor: '#f59e0b', statusText: `${label} İptal Edildi` };
    if (job.status === 'COMPLETED' && job.succeeded === 0) return { headerColor: '#f59e0b', statusText: `${label} Tamamlandı (Tümü Başarısız)` };
    if (job.status === 'COMPLETED' && job.failed > 0 && job.succeeded > 0) return { headerColor: '#f59e0b', statusText: `${label} Kısmen Tamamlandı` };
    return { headerColor: '#329a6d', statusText: `${label} Tamamlandı` };
}

function buildEmailHtml(job: JobRecord, branding: { companyName: string; emailSenderName: string }): string {
    const label = JOB_TYPE_LABELS[job.type] || job.type;
    const { headerColor, statusText } = getJobStatusInfo(job);
    const senderText = `${branding.emailSenderName} · ${branding.companyName}`;
    const startedDate = job.startedAt ? new Date(job.startedAt) : null;
    const completedDate = job.completedAt ? new Date(job.completedAt) : null;
    const duration = startedDate && completedDate
        ? formatDuration(completedDate.getTime() - startedDate.getTime())
        : '—';
    const startedAt = startedDate ? formatDate(startedDate) : '—';
    const completedAt = completedDate ? formatDate(completedDate) : '—';

    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  @media only screen and (max-width:600px) {
    .email-container { width:100% !important; }
    .header-cell { padding:20px 16px !important; }
    .content-cell { padding:16px !important; }
    .content-cell-flush { padding:0 16px 16px !important; }
    .stat-card { display:block !important; width:100% !important; margin-bottom:8px !important; }
    .stat-spacer { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
  <table width="600" cellpadding="0" cellspacing="0" class="email-container" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
    <tr><td style="padding:20px 32px;background:#794889;text-align:center;">
      <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.3px;">${escapeHtml(senderText)}</span>
    </td></tr>
    <tr><td class="header-cell" style="background:${headerColor};padding:24px 32px;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;font-weight:700;">${escapeHtml(statusText)}</h1>
      <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:8px 0 0;">Job ID: ${job.id}</p>
    </td></tr>
    <tr><td class="content-cell" style="padding:24px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td class="stat-card" width="32%" style="text-align:center;padding:16px;background:#f8fafc;border-radius:8px;">
            <div style="font-size:28px;font-weight:700;color:#1e293b;">${job.total}</div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Toplam</div>
          </td>
          <td class="stat-spacer" width="2%"></td>
          <td class="stat-card" width="32%" style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:28px;font-weight:700;color:#16a34a;">${job.succeeded}</div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Başarılı</div>
          </td>
          <td class="stat-spacer" width="2%"></td>
          <td class="stat-card" width="32%" style="text-align:center;padding:16px;background:#fef2f2;border-radius:8px;">
            <div style="font-size:28px;font-weight:700;color:#dc2626;">${job.failed}</div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Başarısız</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td class="content-cell-flush" style="padding:0 32px 24px;">
      <table width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">İşlem Türü</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:13px;color:#1e293b;">${escapeHtml(label)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Süre</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:13px;color:#1e293b;">${duration}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Başlangıç</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:13px;color:#1e293b;">${startedAt}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:13px;">Bitiş</td>
          <td style="padding:10px 0;text-align:right;font-size:13px;color:#1e293b;">${completedAt}</td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#f8fafc;text-align:center;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">Bu e-posta otomatik olarak ${escapeHtml(senderText)} tarafından gönderilmiştir.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function buildResultsCsv(job: JobRecord): string {
    const rows: Array<{ 'E-posta': string; Durum: string; Hata: string }> = [];
    const report = job.executionReport;
    if (report) {
        for (const ok of report.succeededItems || []) {
            rows.push({ 'E-posta': ok.email, Durum: 'Başarılı', Hata: '' });
        }
        for (const fail of report.failedItems || []) {
            rows.push({ 'E-posta': fail.email, Durum: 'Başarısız', Hata: fail.error });
        }
    } else if (job.result) {
        for (const email of job.result.succeededEmails || []) {
            rows.push({ 'E-posta': email, Durum: 'Başarılı', Hata: '' });
        }
        for (const e of job.result.errors || []) {
            rows.push({ 'E-posta': e.email, Durum: 'Başarısız', Hata: e.error });
        }
    }
    return Papa.unparse(rows);
}

function buildMimeMessage(params: { to: string; from: string; subject: string; html: string; csvContent: string }): string {
    const { to, from, subject, html, csvContent } = params;
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const altBoundary = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const htmlBase64 = Buffer.from(html).toString('base64');
    const csvBase64 = Buffer.from(csvContent).toString('base64');
    const message = [
        `MIME-Version: 1.0`,
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        ``,
        `--${altBoundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        htmlBase64,
        ``,
        `--${altBoundary}--`,
        ``,
        `--${boundary}`,
        `Content-Type: text/csv; charset=UTF-8; name="sonuclar.csv"`,
        `Content-Disposition: attachment; filename="sonuclar.csv"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        csvBase64,
        ``,
        `--${boundary}--`,
    ].join('\r\n');
    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function sendViaGmail(adminEmail: string, raw: string): Promise<void> {
    const auth = getSendAuth(adminEmail);
    const gmail = getGoogle().gmail({ version: 'v1', auth });
    await gmailLimiter.schedule(() =>
        gmail.users.messages.send({ userId: 'me', requestBody: { raw } }),
    );
}

export async function sendJobCompletionEmail(jobId: string): Promise<void> {
    const log = getLogger();
    try {
        const job = jobQueue.get(jobId);
        if (!job) {
            log.warn(`sendJobCompletionEmail: Job ${jobId} not found`);
            return;
        }
        if (!getStatus().configured) {
            log.info(`sendJobCompletionEmail: Service Account yapılandırılmamış, atlanıyor`);
            return;
        }

        const { statusText } = getJobStatusInfo(job);
        const countText = `${job.succeeded}/${job.total} Başarılı`;
        const { appConfigService } = await import('./app-config-service');
        const branding = {
            companyName: appConfigService.get('companyName'),
            emailSenderName: appConfigService.get('emailSenderName'),
        };
        const subject = `[${branding.emailSenderName}] ${statusText} — ${countText}`;

        const html = buildEmailHtml(job, branding);
        const csv = buildResultsCsv(job);
        const raw = buildMimeMessage({
            to: job.createdBy,
            from: job.createdBy,
            subject,
            html,
            csvContent: csv,
        });

        await sendViaGmail(job.createdBy, raw);
        log.info(`Completion email sent for job ${jobId} to ${job.createdBy}`);
    } catch (err: any) {
        log.error(`Failed to send completion email for job ${jobId}`, err?.message);
    }
}
