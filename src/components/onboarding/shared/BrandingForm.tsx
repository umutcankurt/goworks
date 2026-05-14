import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../../contexts/AppConfigContext';
import { useToast } from '../../../contexts/ToastContext';
import { Input } from '../../ui/Input';
import { initialsFrom } from '../../../utils/initials';
import { LogoUpload } from './LogoUpload';

interface BrandingFormProps {
    /** Onboarding step "Devam et" butonu validation'a göre disable edilir. */
    onValid?: (valid: boolean) => void;
}

export function BrandingForm({ onValid }: BrandingFormProps) {
    const { t } = useTranslation('onboarding');
    const { t: tSettings } = useTranslation('settings');
    const { config, effectiveSidebarAbbr, setConfig, setConfigLocal, commitConfig } = useAppConfig();
    const { addToast } = useToast();

    const [draftAbbr, setDraftAbbr] = useState(config.sidebarAbbr ?? '');
    const [draftDomain, setDraftDomain] = useState(config.allowedDomain);
    const [domainError, setDomainError] = useState<string | null>(null);

    useEffect(() => {
        setDraftAbbr(config.sidebarAbbr ?? '');
        setDraftDomain(config.allowedDomain);
    }, [config.sidebarAbbr, config.allowedDomain]);

    useEffect(() => {
        const valid = !!config.companyName.trim() && !!config.allowedDomain.trim();
        onValid?.(valid);
    }, [config.companyName, config.allowedDomain, onValid]);

    const handleLive = (key: 'companyName' | 'emailSenderName', value: string) => {
        setConfig(key, value).catch((err: any) =>
            addToast(err.message || 'Kayıt başarısız', 'error'),
        );
    };

    const handleAbbrBlur = async () => {
        const next = draftAbbr.trim() || null;
        if (next === (config.sidebarAbbr ?? null)) return;
        try {
            await commitConfig('sidebarAbbr', next);
        } catch (err: any) {
            addToast(err.message || 'Kayıt başarısız', 'error');
        }
    };

    const handleDomainBlur = async () => {
        const next = draftDomain.trim();
        if (!next) {
            setDomainError(tSettings('general.allowedDomain.requiredError'));
            return;
        }
        setDomainError(null);
        if (next === config.allowedDomain) return;
        try {
            await commitConfig('allowedDomain', next);
        } catch (err: any) {
            setDomainError(err.message);
        }
    };

    return (
        <div className="space-y-5">
            <Input
                label={t('branding.fields.companyName.label')}
                placeholder={t('branding.fields.companyName.placeholder')}
                value={config.companyName}
                onChange={(e) => handleLive('companyName', e.target.value)}
                maxLength={80}
                hint={t('branding.fields.companyName.hint')}
            />

            <Input
                label={t('branding.fields.sidebarAbbr.label')}
                placeholder={initialsFrom(config.companyName) || 'GW'}
                value={draftAbbr}
                onChange={(e) => {
                    setDraftAbbr(e.target.value);
                    setConfigLocal('sidebarAbbr', e.target.value.trim() || null);
                }}
                onBlur={handleAbbrBlur}
                maxLength={5}
                hint={t('branding.fields.sidebarAbbr.hint', { preview: effectiveSidebarAbbr })}
            />

            <Input
                label={t('branding.fields.allowedDomain.label')}
                placeholder={t('branding.fields.allowedDomain.placeholder')}
                value={draftDomain}
                prefix="@"
                onChange={(e) => setDraftDomain(e.target.value)}
                onBlur={handleDomainBlur}
                error={domainError}
                hint={!domainError ? t('branding.fields.allowedDomain.hint') : undefined}
            />

            <Input
                label={t('branding.fields.emailSenderName.label')}
                placeholder={t('branding.fields.emailSenderName.placeholder')}
                value={config.emailSenderName}
                onChange={(e) => handleLive('emailSenderName', e.target.value)}
                maxLength={80}
                hint={t('branding.fields.emailSenderName.hint')}
            />

            <div className="border-t border-white/5 pt-5">
                <LogoUpload />
            </div>
        </div>
    );
}
