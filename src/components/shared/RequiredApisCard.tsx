import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '../ui/Card';
import {
    REQUIRED_GOOGLE_APIS,
    cloudLibraryUrl,
    type RequiredGoogleApi,
} from '../../lib/required-google-apis';

interface RequiredApisCardProps {
    variant?: 'compact' | 'expanded';
    className?: string;
}

function openLibrary(api: RequiredGoogleApi) {
    window.open(cloudLibraryUrl(api.serviceId), '_blank', 'noopener,noreferrer');
}

export function RequiredApisCard({
    variant = 'compact',
    className,
}: RequiredApisCardProps) {
    const { t: tOnboarding } = useTranslation('onboarding');
    const { t: tSettings } = useTranslation('settings');

    const enableLabel = tOnboarding('cloud.enableButton');

    if (variant === 'compact') {
        return (
            <Card tone="elevated" padding="md" className={className}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                    {tOnboarding('cloud.apisTitle')}
                </div>
                <ul className="mt-3 space-y-2">
                    {REQUIRED_GOOGLE_APIS.map((api) => (
                        <li key={`${api.name}-${api.serviceId}`}>
                            <button
                                type="button"
                                onClick={() => openLibrary(api)}
                                aria-label={`${api.name} — ${enableLabel}`}
                                className="group flex w-full items-center gap-2 rounded-md bg-surface-container-lowest px-3 py-2 text-left text-sm text-on-surface transition-colors hover:bg-surface-container hover:text-eth-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary/60"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-eth-primary-container" />
                                <span className="flex-1 truncate">{api.name}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-on-surface-variant transition-colors group-hover:text-eth-primary" />
                            </button>
                        </li>
                    ))}
                </ul>
            </Card>
        );
    }

    return (
        <div
            className={clsx(
                'rounded-2xl bg-surface-container-low border border-outline-variant/40 p-6',
                className,
            )}
        >
            <h2 className="text-lg font-semibold text-on-surface mb-1">
                {tSettings('general.requiredApis.title')}
            </h2>
            <p className="text-sm text-on-surface-variant mb-4">
                {tSettings('general.requiredApis.subtitle')}
            </p>
            <ul className="space-y-2">
                {REQUIRED_GOOGLE_APIS.map((api) => (
                    <li key={`${api.name}-${api.serviceId}`}>
                        <button
                            type="button"
                            onClick={() => openLibrary(api)}
                            aria-label={`${api.name} — ${enableLabel}`}
                            className="group flex w-full items-center gap-3 rounded-lg bg-surface-container-lowest px-4 py-3 text-left text-sm text-on-surface transition-colors hover:bg-surface-container hover:text-eth-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary/60"
                        >
                            <span className="h-2 w-2 rounded-full bg-eth-primary-container" />
                            <span className="flex-1 font-medium">{api.name}</span>
                            <span className="hidden sm:inline text-xs text-on-surface-variant font-mono">
                                {api.serviceId}
                            </span>
                            <ExternalLink className="h-4 w-4 shrink-0 text-on-surface-variant transition-colors group-hover:text-eth-primary" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
