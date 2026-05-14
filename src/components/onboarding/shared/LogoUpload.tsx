import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2 } from 'lucide-react';
import { useAppConfig } from '../../../contexts/AppConfigContext';
import { useToast } from '../../../contexts/ToastContext';
import { Button } from '../../ui/Button';

const ALLOWED = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
const MAX_BYTES = 1024 * 1024;

export function LogoUpload() {
    const { t } = useTranslation('onboarding');
    const { logoDataUrl, effectiveSidebarAbbr, uploadLogo, deleteLogo } = useAppConfig();
    const { addToast } = useToast();
    const [busy, setBusy] = useState(false);

    const handleFile = async (file: File) => {
        if (file.size > MAX_BYTES) {
            addToast(t('branding.logo.tooLarge'), 'error');
            return;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ALLOWED.includes(ext)) {
            addToast(t('branding.logo.invalidFormat'), 'error');
            return;
        }
        try {
            setBusy(true);
            const buf = await file.arrayBuffer();
            await uploadLogo(buf, ext);
            addToast(t('branding.logo.uploaded'));
        } catch (err: any) {
            addToast(err.message || t('branding.logo.uploadFailed'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(t('branding.logo.confirmDelete'))) return;
        try {
            await deleteLogo();
        } catch (err: any) {
            addToast(err.message, 'error');
        }
    };

    return (
        <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-surface-container-highest eth-border-ghost">
                {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                    <span className="text-3xl font-bold text-on-surface-variant">{effectiveSidebarAbbr}</span>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <label className="cursor-pointer">
                    <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Upload className="h-4 w-4" />}
                        loading={busy}
                        type="button"
                        onClick={(e) => {
                            // Wrapping label tıklamasını input'a iletir; button'un native action'ı yok.
                            (e.currentTarget.parentElement?.querySelector('input[type=file]') as HTMLInputElement | null)?.click();
                        }}
                    >
                        {logoDataUrl ? t('branding.logo.replace') : t('branding.logo.upload')}
                    </Button>
                    <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.svg,.webp"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                            e.target.value = '';
                        }}
                    />
                </label>
                {logoDataUrl && (
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        onClick={handleDelete}
                    >
                        {t('branding.logo.delete')}
                    </Button>
                )}
                <p className="text-xs text-on-surface-variant">{t('branding.logo.hint')}</p>
            </div>
        </div>
    );
}
