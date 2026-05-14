import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../../contexts/AppConfigContext';

/**
 * Onboarding firma bilgileri adımındaki canlı önizleme.
 * Kullanıcı input'lara yazdıkça gerçek uygulamanın sidebar + login form
 * mockup'ı gerçek zamanlı güncellenir (AppConfigContext'in optimistic
 * setConfig'i sayesinde IPC commit'i beklemeden).
 */
export function LivePreview() {
    const { t } = useTranslation('onboarding');
    const { config, effectiveSidebarAbbr, logoDataUrl } = useAppConfig();

    const company = config.companyName.trim() || t('branding.preview.placeholderCompany');
    const domain = config.allowedDomain.trim() || t('branding.preview.placeholderDomain');

    return (
        <div className="eth-glass eth-glow-cyan-ambient p-5">
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                    {t('branding.preview.title')}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-on-surface-variant">
                    {t('branding.preview.live')}
                </span>
            </div>

            <div className="overflow-hidden rounded-lg bg-surface-container-low">
                <div className="flex">
                    {/* Mini sidebar */}
                    <div className="w-32 shrink-0 bg-surface-container-lowest p-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-eth-primary-container/15">
                                {logoDataUrl ? (
                                    <img src={logoDataUrl} alt="" className="h-full w-full object-contain" />
                                ) : (
                                    <span className="text-[10px] font-bold text-eth-primary">
                                        {effectiveSidebarAbbr}
                                    </span>
                                )}
                            </div>
                            <span className="truncate text-xs font-semibold text-on-surface">{company}</span>
                        </div>
                        <div className="mt-3 space-y-1.5">
                            <div className="h-1.5 rounded bg-white/10" />
                            <div className="h-1.5 rounded bg-white/10" />
                            <div className="h-1.5 rounded bg-white/5" />
                            <div className="h-1.5 rounded bg-white/5" />
                        </div>
                    </div>

                    {/* Mini login form */}
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5">
                        <div className="text-center">
                            <div className="text-[11px] font-medium text-on-surface-variant">
                                {t('branding.preview.loginEyebrow')}
                            </div>
                            <div className="mt-0.5 text-sm font-semibold text-on-surface">
                                {t('branding.preview.loginTitle', { company })}
                            </div>
                        </div>
                        <div className="rounded-md bg-eth-primary-container px-3 py-1.5 text-[10px] font-semibold text-on-eth-primary-container">
                            {t('branding.preview.googleCta')}
                        </div>
                        <div className="text-[10px] text-on-surface-variant">@{domain}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
