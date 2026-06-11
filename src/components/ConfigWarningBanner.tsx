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
 * Boot-time soft-warn banner. Renders only if the `config:getBootStatus` IPC
 * handler returns a warning flag; otherwise null. The banner is placed at the
 * topmost layer of App.tsx so it shows on every page.
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
                /* if boot-status is unreachable the banner stays hidden */
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
