import React, { useState, useEffect } from 'react';
import { Download, ChevronRight, ChevronLeft, Eye } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { CsvUpload } from '../CsvUpload';
import { validateCsvColumns } from '../../utils/csv-validator';
import { BULK_ACTION_CONFIGS } from '../../config/bulk-action-config';
import { bulkApi, templatesApi } from '../../services/server-api';
import type { BulkActionType } from '../../types/admin';

interface CsvUploadStepProps {
    action: BulkActionType;
    onBack: () => void;
    onContinue: (rows: Record<string, string>[], templateId: number | null) => void;
}

export const CsvUploadStep: React.FC<CsvUploadStepProps> = ({ action, onBack, onContinue }) => {
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [columnError, setColumnError] = useState<string | null>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
    const { t } = useTranslation('bulk');

    const config = BULK_ACTION_CONFIGS[action];

    useEffect(() => {
        if (action === 'signature_push') {
            templatesApi.getAll().then(setTemplates).catch(() => {});
        }
    }, [action]);

    const handleUpload = (uploadedRows: Record<string, string>[]) => {
        setColumnError(null);

        if (uploadedRows.length === 0) {
            setRows([]);
            return;
        }

        const { valid, missingColumns } = validateCsvColumns(uploadedRows, action);
        if (!valid) {
            setColumnError(
                missingColumns.length > 0
                    ? t('csvStep.missingColumns', { columns: missingColumns.join(', ') })
                    : t('csvStep.csvEmpty')
            );
            setRows([]);
            return;
        }

        setRows(uploadedRows);
    };

    const handleDownloadTemplate = async () => {
        await bulkApi.downloadTemplate(action);
    };

    const canContinue = rows.length > 0 && !columnError &&
        (action !== 'signature_push' || selectedTemplateId !== null);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                >
                    <ChevronLeft size={16} />
                    <span>{t('csvStep.back')}</span>
                </button>

                <span className="text-sm font-semibold text-on-surface">
                    {t(`actions.${config.type}.label`)}
                </span>

                <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-eth-primary bg-eth-primary-container/10 hover:bg-eth-primary-container/15 rounded-lg transition-colors"
                >
                    <Download size={14} />
                    {t('csvStep.downloadTemplate')}
                </button>
            </div>

            {action === 'signature_push' && (
                <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-lg">
                    <span className="text-sm font-medium text-violet-700">{t('csvStep.templateLabel')}</span>
                    <select
                        value={selectedTemplateId ?? ''}
                        onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                        className="bg-surface-container border border-violet-300 text-on-surface rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none"
                    >
                        <option value="">{t('csvStep.selectTemplate')}</option>
                        {templates.map(tmpl => (
                            <option key={tmpl.id} value={tmpl.id}>{tmpl.name}{tmpl.isDefault ? t('csvStep.defaultSuffix') : ''}</option>
                        ))}
                    </select>
                    {templates.length === 0 && (
                        <span className="text-xs text-amber-500">{t('csvStep.noTemplates')}</span>
                    )}
                </div>
            )}

            <CsvUpload onUpload={handleUpload} />

            {columnError && (
                <div className="p-3 bg-eth-danger/10 border border-eth-danger/30 rounded-lg text-sm text-eth-danger">
                    {columnError}
                    <p className="mt-1 text-xs text-eth-danger">
                        {t('csvStep.requiredColumns', { columns: config.requiredColumns.join(', ') })}
                    </p>
                </div>
            )}

            {rows.length > 0 && !columnError && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <Eye size={14} />
                        <span>
                            <Trans
                                i18nKey="csvStep.rowsLoadedTemplate"
                                t={t}
                                values={{ count: rows.length }}
                                components={{ b: <strong /> }}
                            />
                        </span>
                    </div>
                    <div className="overflow-x-auto border border-outline-variant/30 rounded-lg">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-surface-container-low">
                                    {Object.keys(rows[0]).map(col => (
                                        <th key={col} className="px-3 py-2 text-left text-xs font-medium text-on-surface-variant uppercase">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="border-t border-outline-variant/30">
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-3 py-2 text-on-surface truncate max-w-[200px]">
                                                {val || <span className="text-on-surface-variant">-</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    onClick={() => onContinue(rows, selectedTemplateId)}
                    disabled={!canContinue}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-eth-primary-container hover:bg-eth-primary-container text-on-eth-primary-container rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span>{t('csvStep.continue')}</span>
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
};
