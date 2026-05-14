import { createHash } from 'node:crypto';
import { getDb } from '../db';
import type { TemplateVariables } from './template-renderer';

/**
 * İmza Denetimi durum kaydı.
 *
 * `signature_state` tablosu, bir kişiye **en son basılan** imzanın parmak izini tutar.
 * `pushSignature` her başarılı push'ta buraya yazar (tek kişi / bulk / denetim — hepsi).
 * Hızlı tarama, güncel veriden hesaplanan hedef hash'i bu kayıttaki `desired_hash` ile
 * karşılaştırarak sapma (drift) tespit eder.
 */

export interface SignatureStateRow {
    email: string;
    templateId: number | null;
    desiredHash: string;
    variablesSnapshot: Record<string, string> | null;
    lastPushedAt: string;
}

interface SignatureStateDbRow {
    email: string;
    template_id: number | null;
    desired_hash: string;
    variables_snapshot: string | null;
    last_pushed_at: string;
}

function toApi(row: SignatureStateDbRow): SignatureStateRow {
    let variablesSnapshot: Record<string, string> | null = null;
    if (row.variables_snapshot) {
        try {
            variablesSnapshot = JSON.parse(row.variables_snapshot);
        } catch {
            variablesSnapshot = null;
        }
    }
    return {
        email: row.email,
        templateId: row.template_id,
        desiredHash: row.desired_hash,
        variablesSnapshot,
        lastPushedAt: row.last_pushed_at,
    };
}

/**
 * Render edilmiş imza HTML'inin deterministik parmak izi (SHA-256).
 * Push yolu ve tarama worker'ı bu **aynı** fonksiyonu kullanmalı ki hash'ler birebir uyuşsun.
 */
export function hashSignatureHtml(html: string): string {
    return createHash('sha256').update(html, 'utf8').digest('hex');
}

export interface SignatureStateUpsertInput {
    email: string;
    templateId: number | null;
    desiredHash: string;
    variablesSnapshot?: TemplateVariables | Record<string, string> | null;
}

export const signatureStateService = {
    upsert(input: SignatureStateUpsertInput): void {
        const snapshot = input.variablesSnapshot
            ? JSON.stringify(input.variablesSnapshot)
            : null;
        getDb()
            .prepare(
                `INSERT INTO signature_state (email, template_id, desired_hash, variables_snapshot, last_pushed_at)
                 VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(email) DO UPDATE SET
                   template_id = excluded.template_id,
                   desired_hash = excluded.desired_hash,
                   variables_snapshot = excluded.variables_snapshot,
                   last_pushed_at = excluded.last_pushed_at`,
            )
            .run(input.email, input.templateId, input.desiredHash, snapshot);
    },

    /**
     * Başarılı bir imza push'unun ardından durum kaydını best-effort günceller.
     * Bir SQLite yazma hatası başarılı bir push'u başarısız saymamalı — hata yutulur.
     * Tek kişi (`pushSignature`) ve bulk worker (`signature-push-worker`) ortak kullanır.
     */
    recordPush(
        email: string,
        templateId: number | null,
        renderedHtml: string,
        variablesSnapshot?: TemplateVariables | Record<string, string> | null,
    ): void {
        try {
            this.upsert({
                email,
                templateId,
                desiredHash: hashSignatureHtml(renderedHtml),
                variablesSnapshot: variablesSnapshot ?? null,
            });
        } catch (err) {
            console.warn(`[signature-state] durum kaydı güncellenemedi (${email}):`, err);
        }
    },

    get(email: string): SignatureStateRow | null {
        const row = getDb()
            .prepare('SELECT * FROM signature_state WHERE email = ?')
            .get(email) as SignatureStateDbRow | undefined;
        return row ? toApi(row) : null;
    },

    getMany(emails: string[]): Map<string, SignatureStateRow> {
        const result = new Map<string, SignatureStateRow>();
        if (emails.length === 0) return result;
        // SQLite değişken limiti (999) için parçalara böl
        const CHUNK = 400;
        const db = getDb();
        for (let i = 0; i < emails.length; i += CHUNK) {
            const chunk = emails.slice(i, i + CHUNK);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = db
                .prepare(`SELECT * FROM signature_state WHERE email IN (${placeholders})`)
                .all(...chunk) as SignatureStateDbRow[];
            for (const row of rows) {
                result.set(row.email, toApi(row));
            }
        }
        return result;
    },
};
