import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SignatureAuditItem } from '../../services/server-api';
import { CATEGORY_META } from './AuditReviewTable';

/** Canonical variable keys to show in the diff. */
const DIFF_KEYS = ['ad_soyad', 'unvan', 'kurum_adi', 'kurum_adres', 'kurum_telefon', 'telefon', 'eposta'] as const;

interface AuditResultRowProps {
    item: SignatureAuditItem;
    selectable: boolean;
    selected: boolean;
    onToggle: (email: string) => void;
}

export function AuditResultRow({ item, selectable, selected, onToggle }: AuditResultRowProps) {
    const { t } = useTranslation('signatureAudit');
    const [expanded, setExpanded] = useState(false);

    const cur = item.currentVariables || {};
    const prev = item.previousVariables || {};
    const hasPrev = item.previousVariables != null;
    const hasDetail = item.currentVariables != null || hasPrev;

    return (
        <>
            <tr className="border-t border-outline-variant/20 hover:bg-surface-container-low transition-colors">
                <td className="px-3 py-2.5">
                    {selectable ? (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggle(item.email)}
                            className="rounded border-outline-variant/40 text-eth-primary focus:ring-eth-primary"
                        />
                    ) : (
                        <span className="inline-block w-4" />
                    )}
                </td>
                <td className="px-3 py-2.5 text-sm text-on-surface">{item.email}</td>
                <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_META[item.category].badgeClass}`}>
                        {t(`category.${item.category}`)}
                    </span>
                </td>
                <td className="px-3 py-2.5 text-sm text-on-surface-variant">
                    {item.reason ? t(`reason.${item.reason}`, { defaultValue: item.reason }) : '—'}
                    {item.error && <span className="text-eth-danger"> · {item.error}</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                    {hasDetail && (
                        <button
                            type="button"
                            onClick={() => setExpanded((e) => !e)}
                            className="text-on-surface-variant hover:text-on-surface"
                            aria-label={t('review.toggleDetail')}
                        >
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                    )}
                </td>
            </tr>
            {expanded && hasDetail && (
                <tr className="bg-surface-container-low">
                    <td colSpan={5} className="px-6 py-3">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-on-surface-variant">
                                    <th className="py-1 pr-3 text-left font-medium w-40">{t('review.diff.variable')}</th>
                                    {hasPrev && <th className="py-1 pr-2 text-left font-medium">{t('review.diff.previous')}</th>}
                                    <th className="py-1 text-left font-medium">{t('review.diff.current')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {DIFF_KEYS.map((key) => {
                                    const c = cur[key] ?? '';
                                    const p = prev[key] ?? '';
                                    const changed = hasPrev && c !== p;
                                    return (
                                        <tr key={key}>
                                            <td className="py-1 pr-3 text-on-surface-variant font-mono">{key}</td>
                                            {hasPrev && (
                                                <td className={`py-1 pr-2 ${changed ? 'text-eth-danger line-through' : 'text-on-surface-variant'}`}>
                                                    {p || '—'}
                                                </td>
                                            )}
                                            <td className={`py-1 ${changed ? 'text-eth-secondary font-medium' : 'text-on-surface'}`}>
                                                {c || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    );
}
