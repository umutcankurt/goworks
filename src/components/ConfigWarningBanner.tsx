import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

interface BootStatus {
    soft: {
        serviceAccountMissing: boolean;
    };
}

interface IpcWindow {
    ipcRenderer?: {
        invoke?: (channel: string) => Promise<unknown>;
    };
}

/**
 * Boot-time soft-warn banner. Sadece `config:getBootStatus` IPC handler'ı
 * bir uyarı bayrağı döndürürse render eder; aksi hâlde null. Banner App.tsx
 * en üst layer'a konur ki tüm sayfalarda görünsün.
 */
export function ConfigWarningBanner() {
    const { t } = useTranslation('common');
    const [status, setStatus] = useState<BootStatus | null>(null);

    useEffect(() => {
        const ipc = (window as unknown as IpcWindow).ipcRenderer;
        if (!ipc?.invoke) return;
        ipc.invoke('config:getBootStatus')
            .then((s) => setStatus(s as BootStatus))
            .catch(() => {
                /* boot-status erişilemezse banner gizli kalır */
            });
    }, []);

    if (!status?.soft?.serviceAccountMissing) return null;

    return (
        <div
            role="status"
            className="flex items-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
        >
            <AlertTriangle size={16} aria-hidden="true" />
            <span className="font-medium">
                {t('bootWarning.serviceAccountMissingTitle')}:
            </span>
            <span>{t('bootWarning.serviceAccountMissingDetail')}</span>
        </div>
    );
}
