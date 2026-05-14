import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionSelector } from '../components/bulk/ActionSelector';
import { CsvUploadStep } from '../components/bulk/CsvUploadStep';
import { AnalysisSummary } from '../components/bulk/AnalysisSummary';
import { ExecutionPanel } from '../components/bulk/ExecutionPanel';
import { useToast } from '../contexts/ToastContext';
import { bulkApi } from '../services/server-api';
import type { BulkActionType, BulkAnalyzeResponseDto, ValidatedRow } from '../types/admin';
import { HelpGuide } from '../components/HelpGuide';
import { normalizeRowColumns } from '../utils/bulkColumns';

type WizardStep = 'select-action' | 'upload-csv' | 'analysis' | 'executing';

interface BulkWizardState {
    step: WizardStep;
    action: BulkActionType;
    rawRows: Record<string, string>[];
    analysisResult: BulkAnalyzeResponseDto | null;
    validRows: ValidatedRow[];
    selectedTemplateId: number | null;
}

const STEP_KEYS: Record<WizardStep, string> = {
    'select-action': 'steps.selectAction',
    'upload-csv': 'steps.uploadCsv',
    'analysis': 'steps.analysis',
    'executing': 'steps.executing',
};

const STEP_ORDER: WizardStep[] = ['select-action', 'upload-csv', 'analysis', 'executing'];

export function BulkOperations() {
    const { addToast } = useToast();
    const { t, i18n } = useTranslation('bulk');
    const { t: tToast } = useTranslation('toast');
    const [analyzing, setAnalyzing] = useState(false);

    const [state, setState] = useState<BulkWizardState>({
        step: 'select-action',
        action: 'suspend',
        rawRows: [],
        analysisResult: null,
        validRows: [],
        selectedTemplateId: null,
    });

    const resetWizard = () => {
        setState({
            step: 'select-action',
            action: 'suspend',
            rawRows: [],
            analysisResult: null,
            validRows: [],
            selectedTemplateId: null,
        });
    };

    const handleActionSelect = (action: BulkActionType) => {
        setState(prev => ({ ...prev, action, step: 'upload-csv' }));
    };

    const handleCsvContinue = async (rows: Record<string, string>[], templateId: number | null) => {
        setState(prev => ({ ...prev, rawRows: rows, selectedTemplateId: templateId }));

        setAnalyzing(true);
        try {
            const result = await bulkApi.analyze({
                actionType: state.action,
                rows,
                lang: i18n.language as 'tr' | 'en',
            });
            setState(prev => ({
                ...prev,
                analysisResult: result,
                validRows: result.validRows,
                step: 'analysis',
            }));
        } catch (err: any) {
            addToast(tToast('bulk.analyzeFailed', { error: err.message }), 'error');
            setState(prev => ({
                ...prev,
                // Analiz başarısız oldu: worker'a giden satırları yine de kanonik
                // forma çevir (TR/EN başlıklar normalize edilmiş olsun).
                validRows: rows.map((data, i) => ({ rowNumber: i + 1, data: normalizeRowColumns(data) })),
                step: 'executing',
            }));
        } finally {
            setAnalyzing(false);
        }
    };

    const handleAnalysisContinue = () => {
        setState(prev => ({ ...prev, step: 'executing' }));
    };

    const handleAnalysisBack = () => {
        setState(prev => ({
            ...prev,
            step: 'upload-csv',
            analysisResult: null,
            validRows: [],
        }));
    };

    const currentStepIndex = STEP_ORDER.indexOf(state.step);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-on-surface">{t('title')}</h2>
                <HelpGuide namespace="bulk" />
            </div>

            <div className="flex items-center gap-2 text-sm">
                {STEP_ORDER.map((step, i) => {
                    const isActive = i === currentStepIndex;
                    const isPast = i < currentStepIndex;
                    return (
                        <div key={step} className="flex items-center gap-2">
                            {i > 0 && <div className={`w-8 h-px ${isPast ? 'bg-eth-primary-container/60' : 'bg-surface-container-highest'}`} />}
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                isActive
                                    ? 'bg-eth-primary-container/15 text-eth-primary'
                                    : isPast
                                    ? 'bg-eth-secondary/15 text-eth-secondary'
                                    : 'bg-surface-container-high text-on-surface-variant'
                            }`}>
                                {t(STEP_KEYS[step])}
                            </span>
                        </div>
                    );
                })}
            </div>

            <motion.div
                key={state.step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-container rounded-xl p-6 shadow-sm border border-outline-variant/30"
            >
                {state.step === 'select-action' && (
                    <ActionSelector onSelect={handleActionSelect} />
                )}

                {state.step === 'upload-csv' && !analyzing && (
                    <CsvUploadStep
                        action={state.action}
                        onBack={() => setState(prev => ({ ...prev, step: 'select-action' }))}
                        onContinue={handleCsvContinue}
                    />
                )}

                {analyzing && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader size={32} className="animate-spin text-eth-primary" />
                        <p className="text-on-surface-variant font-medium">{t('analyzing')}</p>
                    </div>
                )}

                {state.step === 'analysis' && state.analysisResult && (
                    <AnalysisSummary
                        result={state.analysisResult}
                        onBack={handleAnalysisBack}
                        onContinue={handleAnalysisContinue}
                    />
                )}

                {state.step === 'executing' && (
                    <ExecutionPanel
                        action={state.action}
                        rows={state.analysisResult
                            ? state.validRows.map(r => r.data)
                            : state.rawRows
                        }
                        validatedRows={state.validRows.length > 0 ? state.validRows : undefined}
                        templateId={state.selectedTemplateId}
                        onReset={resetWizard}
                    />
                )}
            </motion.div>
        </div>
    );
}
