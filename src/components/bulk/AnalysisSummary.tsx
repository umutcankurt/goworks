import React from 'react';
import { ChevronLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BulkAnalyzeResponseDto } from '../../types/admin';

interface AnalysisSummaryProps {
    result: BulkAnalyzeResponseDto;
    onBack: () => void;
    onContinue: () => void;
}

export const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({ result, onBack, onContinue }) => {
    const { summary, invalidRows } = result;
    const allInvalid = summary.validCount === 0;
    const { t } = useTranslation('bulk');

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                >
                    <ChevronLeft size={16} />
                    <span>{t('analysis.back')}</span>
                </button>
                <h3 className="text-lg font-semibold text-on-surface">{t('analysis.title')}</h3>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low rounded-xl p-4 text-center border border-outline-variant/30">
                    <p className="text-2xl font-bold text-on-surface">{summary.totalRows}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{t('analysis.totalRows')}</p>
                </div>
                <div className="bg-eth-secondary/10 rounded-xl p-4 text-center border border-eth-secondary/30">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <CheckCircle size={16} className="text-eth-secondary" />
                    </div>
                    <p className="text-2xl font-bold text-eth-secondary">{summary.validCount}</p>
                    <p className="text-xs text-eth-secondary mt-1">{t('analysis.validRows')}</p>
                </div>
                <div className="bg-eth-danger/10 rounded-xl p-4 text-center border border-eth-danger/30">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <XCircle size={16} className="text-rose-500" />
                    </div>
                    <p className="text-2xl font-bold text-eth-danger">{summary.invalidCount}</p>
                    <p className="text-xs text-rose-500 mt-1">{t('analysis.invalidRows')}</p>
                </div>
            </div>

            {invalidRows.length > 0 && (
                <div className="border border-eth-danger/30 rounded-xl overflow-hidden">
                    <div className="bg-eth-danger/10 px-4 py-3 border-b border-eth-danger/30 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-rose-500" />
                        <span className="text-sm font-medium text-eth-danger">{t('analysis.invalidTitle', { count: invalidRows.length })}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-surface-container">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-on-surface-variant">{t('analysis.table.row')}</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-on-surface-variant">{t('analysis.table.email')}</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-on-surface-variant">{t('analysis.table.field')}</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-on-surface-variant">{t('analysis.table.error')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invalidRows.flatMap((row) =>
                                    row.errors.map((err, errIdx) => (
                                        <tr key={`${row.rowNumber}-${errIdx}`} className="border-t border-outline-variant/30 hover:bg-surface-container-low">
                                            <td className="px-4 py-2 text-on-surface-variant font-mono text-xs">{row.rowNumber}</td>
                                            <td className="px-4 py-2 text-on-surface truncate max-w-[200px]">{row.rawData?.email || '-'}</td>
                                            <td className="px-4 py-2">
                                                <span className="bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded text-xs font-mono">{err.field}</span>
                                            </td>
                                            <td className="px-4 py-2 text-eth-danger text-xs">{err.message}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between pt-2">
                <button
                    onClick={onBack}
                    className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-lg hover:bg-surface-container-low transition-colors"
                >
                    {t('analysis.cancelFix')}
                </button>
                <button
                    onClick={onContinue}
                    disabled={allInvalid}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-eth-primary-container hover:bg-eth-primary-container text-on-eth-primary-container rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={allInvalid ? t('analysis.allInvalidTitle') : ''}
                >
                    {summary.invalidCount > 0
                        ? t('analysis.continueWithSkip', { count: summary.validCount })
                        : t('analysis.continue', { count: summary.validCount })
                    }
                </button>
            </div>
        </div>
    );
};
