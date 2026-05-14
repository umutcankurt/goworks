import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { appConfigApi, type DwdTestResult } from '../../../services/server-api';
import { Button } from '../../ui/Button';
import { useAuth } from '../../../contexts/AuthContext';

interface DwdTestButtonProps {
    onSuccess?: () => void;
}

export function DwdTestButton({ onSuccess }: DwdTestButtonProps) {
    const { t } = useTranslation('onboarding');
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<DwdTestResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await appConfigApi.testDwdScopes(user?.email);
            setResult(res);
            if (res.ok) onSuccess?.();
        } catch (err: any) {
            setError(err.message || 'Test failed');
            setResult(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <Button
                variant="primary"
                onClick={run}
                loading={busy}
                leftIcon={<RefreshCw className="h-4 w-4" />}
            >
                {busy ? t('dwd.testing') : t('dwd.testButton')}
            </Button>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-eth-danger/30 bg-eth-danger/10 px-3 py-2 text-sm text-eth-danger">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {result && result.ok && (
                <div className="flex items-start gap-2 rounded-lg border border-eth-secondary/30 bg-eth-secondary/10 px-3 py-2 text-sm text-eth-secondary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{t('dwd.testSuccess', { adminEmail: result.adminEmail })}</span>
                </div>
            )}

            {result && !result.ok && (
                <div className="space-y-2 rounded-lg border border-eth-danger/30 bg-eth-danger/10 px-3 py-2 text-sm text-eth-danger">
                    <div className="flex items-start gap-2">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            {t('dwd.testFail', {
                                error: result.errorMessage || 'Authorization failed',
                            })}
                        </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                        {t('dwd.testFailHelp', { adminEmail: result.adminEmail })}
                    </p>
                </div>
            )}
        </div>
    );
}
