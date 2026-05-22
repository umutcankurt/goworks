import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { appConfigApi } from '../../../services/server-api';

const ADMIN_CONSOLE_DWD_URL = 'https://admin.google.com/ac/owl/domainwidedelegation';

interface DwdScopeGuideProps {
    clientId: string | null;
}

export function DwdScopeGuide({ clientId }: DwdScopeGuideProps) {
    const { t } = useTranslation('onboarding');
    const [copied, setCopied] = useState<string | null>(null);
    const [scopes, setScopes] = useState<string[]>([]);

    useEffect(() => {
        appConfigApi.getDwdScopes().then(setScopes).catch(() => setScopes([]));
    }, []);

    const copy = async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(key);
            setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1500);
        } catch {
            /* clipboard API blocked */
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-lg bg-surface-container-lowest eth-border-ghost-soft p-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                    {t('dwd.clientIdLabel')}
                </div>
                {clientId ? (
                    <div className="flex items-center justify-between gap-3">
                        <code className="break-all font-mono text-sm text-on-surface">
                            {clientId}
                        </code>
                        <button
                            type="button"
                            onClick={() => copy(clientId, 'cid')}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-container-high px-2.5 py-1.5 text-xs text-on-surface-variant hover:text-on-surface"
                        >
                            {copied === 'cid' ? <Check className="h-3.5 w-3.5 text-eth-secondary" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied === 'cid' ? t('dwd.copied') : t('dwd.copy')}
                        </button>
                    </div>
                ) : (
                    <div className="text-sm text-on-surface-variant">{t('dwd.clientIdMissing')}</div>
                )}
            </div>

            <div className="rounded-lg bg-surface-container-lowest eth-border-ghost-soft p-4">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                        {t('dwd.scopesLabel', { count: scopes.length })}
                    </span>
                    <button
                        type="button"
                        onClick={() => copy(scopes.join(','), 'all')}
                        className="inline-flex items-center gap-1.5 rounded-md bg-surface-container-high px-2.5 py-1.5 text-xs text-eth-primary hover:brightness-110"
                    >
                        {copied === 'all' ? <Check className="h-3.5 w-3.5 text-eth-secondary" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === 'all' ? t('dwd.copied') : t('dwd.copyAll')}
                    </button>
                </div>
                <ul className="space-y-1.5">
                    {scopes.map((scope, idx) => (
                        <li
                            key={scope}
                            className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
                        >
                            <code className="truncate font-mono text-on-surface-variant">{scope}</code>
                            <button
                                type="button"
                                onClick={() => copy(scope, `s${idx}`)}
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                aria-label={t('dwd.copy')}
                            >
                                {copied === `s${idx}` ? (
                                    <Check className="h-3.5 w-3.5 text-eth-secondary" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5 text-on-surface-variant" />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <a
                href={ADMIN_CONSOLE_DWD_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-sm text-eth-primary hover:underline"
            >
                <ExternalLink className="h-4 w-4" />
                {t('dwd.openConsole')}
            </a>
        </div>
    );
}
