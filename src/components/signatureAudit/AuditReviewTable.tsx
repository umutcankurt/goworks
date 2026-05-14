import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignatureAuditItem, AuditCategory } from '../../services/server-api';
import { AuditResultRow } from './AuditResultRow';

/** Kategori → rozet stili. AuditResultRow da bunu kullanır. */
export const CATEGORY_META: Record<AuditCategory, { badgeClass: string; cardClass: string }> = {
    ok: {
        badgeClass: 'bg-eth-secondary/15 text-eth-secondary',
        cardClass: 'border-eth-secondary/30 bg-eth-secondary/10',
    },
    drift: {
        badgeClass: 'bg-amber-500/15 text-amber-600',
        cardClass: 'border-amber-500/30 bg-amber-500/10',
    },
    no_signature: {
        badgeClass: 'bg-eth-primary-container/15 text-eth-primary',
        cardClass: 'border-eth-primary-container/30 bg-eth-primary-container/10',
    },
    missing_data: {
        badgeClass: 'bg-surface-container-highest text-on-surface-variant',
        cardClass: 'border-outline-variant/40 bg-surface-container-high',
    },
    error: {
        badgeClass: 'bg-eth-danger/15 text-eth-danger',
        cardClass: 'border-eth-danger/30 bg-eth-danger/10',
    },
};

const CATEGORY_ORDER: AuditCategory[] = ['drift', 'no_signature', 'ok', 'missing_data', 'error'];
/** Push (güncelleme) gerektiren — yani seçilebilir — kategoriler. */
const SELECTABLE: AuditCategory[] = ['drift', 'no_signature'];

interface AuditReviewTableProps {
    items: SignatureAuditItem[];
    onApply: (emails: string[]) => void;
    onReset: () => void;
}

export function AuditReviewTable({ items, onApply, onReset }: AuditReviewTableProps) {
    const { t } = useTranslation('signatureAudit');
    const [filter, setFilter] = useState<AuditCategory | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const counts = useMemo(() => {
        const c: Record<AuditCategory, number> = { ok: 0, drift: 0, no_signature: 0, missing_data: 0, error: 0 };
        for (const it of items) c[it.category]++;
        return c;
    }, [items]);

    const updatableEmails = useMemo(
        () => items.filter((it) => SELECTABLE.includes(it.category)).map((it) => it.email),
        [items],
    );

    const visible = useMemo(
        () => (filter ? items.filter((it) => it.category === filter) : items),
        [items, filter],
    );

    const toggle = (email: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const selectAllUpdatable = () => setSelected(new Set(updatableEmails));
    const clearSelection = () => setSelected(new Set());

    return (
        <div className="space-y-4">
            {/* Özet kartları — tıklayınca filtreler */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CATEGORY_ORDER.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setFilter(filter === cat ? null : cat)}
                        className={`p-3 rounded-xl border text-left transition-all ${CATEGORY_META[cat].cardClass} ${
                            filter === cat ? 'ring-2 ring-eth-primary/50' : ''
                        }`}
                    >
                        <div className="text-2xl font-bold text-on-surface">{counts[cat]}</div>
                        <div className="text-xs text-on-surface-variant mt-0.5">{t(`category.${cat}`)}</div>
                    </button>
                ))}
            </div>

            {/* Aksiyon çubuğu */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={selectAllUpdatable}
                        disabled={updatableEmails.length === 0}
                        className="px-3 py-1.5 text-sm rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
                    >
                        {t('review.selectAllUpdatable', { count: updatableEmails.length })}
                    </button>
                    {selected.size > 0 && (
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        >
                            {t('review.clearSelection')}
                        </button>
                    )}
                    {filter && (
                        <button
                            type="button"
                            onClick={() => setFilter(null)}
                            className="px-3 py-1.5 text-sm rounded-lg text-eth-primary hover:bg-eth-primary-container/10 transition-colors"
                        >
                            {t('review.clearFilter')}
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onReset}
                        className="px-4 py-2 text-sm rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low transition-colors"
                    >
                        {t('review.newAudit')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply([...selected])}
                        disabled={selected.size === 0}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-eth-primary-container text-on-eth-primary-container hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {t('review.applySelected', { count: selected.size })}
                    </button>
                </div>
            </div>

            {/* Tablo */}
            <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-surface-container-high">
                        <tr className="text-left text-xs text-on-surface-variant">
                            <th className="px-3 py-2 w-10"></th>
                            <th className="px-3 py-2 font-medium">{t('review.col.email')}</th>
                            <th className="px-3 py-2 font-medium">{t('review.col.category')}</th>
                            <th className="px-3 py-2 font-medium">{t('review.col.reason')}</th>
                            <th className="px-3 py-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((item) => (
                            <AuditResultRow
                                key={item.id}
                                item={item}
                                selectable={SELECTABLE.includes(item.category)}
                                selected={selected.has(item.email)}
                                onToggle={toggle}
                            />
                        ))}
                        {visible.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-10 text-center text-sm text-on-surface-variant">
                                    {t('review.empty')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
