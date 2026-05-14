import React, { ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundaryInner extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        const { t } = this.props;
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
                    <div className="text-eth-danger text-5xl mb-4">⚠</div>
                    <h2 className="text-xl font-semibold text-on-surface mb-2">{t('errorBoundary.title')}</h2>
                    <p className="text-on-surface-variant text-sm mb-6">{t('errorBoundary.description')}</p>
                    {import.meta.env.DEV && this.state.error && (
                        <pre className="text-left text-xs bg-surface-container-low border border-outline-variant/30 rounded p-4 max-w-lg overflow-auto text-eth-danger mb-6">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        onClick={this.handleReload}
                        className="px-4 py-2 bg-eth-primary-container text-white rounded-lg hover:brightness-110 transition-colors font-medium"
                    >
                        {t('retry')}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export const ErrorBoundary = withTranslation('common')(ErrorBoundaryInner);
