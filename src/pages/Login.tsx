import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../contexts/AppConfigContext';
import { motion } from 'framer-motion';
import { ShieldAlert, Fingerprint, Loader2 } from 'lucide-react';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login() {
    const { login, isAuthenticated, isLoading } = useAuth();
    const { config } = useAppConfig();
    const navigate = useNavigate();
    const { t } = useTranslation('login');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const handleLogin = async () => {
        try {
            setErrorMsg(null);
            await login();
        } catch (err: any) {
            setErrorMsg(err.message || t('unexpectedError'));
        }
    };

    return (
        <div className="eth-app min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div
                className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full blur-3xl pointer-events-none"
                style={{ background: 'color-mix(in srgb, var(--color-eth-primary-container) 18%, transparent)' }}
                aria-hidden
            />
            <div
                className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 rounded-full blur-3xl pointer-events-none"
                style={{ background: 'color-mix(in srgb, var(--color-eth-secondary) 12%, transparent)' }}
                aria-hidden
            />

            <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
                <ThemeToggle variant="ethereal" />
                <LanguageSwitch variant="ethereal" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="w-full max-w-md relative z-10"
            >
                <div className="eth-glass eth-glow-cyan-panel p-8 rounded-3xl flex flex-col items-center">
                    <div className="w-16 h-16 bg-eth-primary-container rounded-2xl flex items-center justify-center text-on-eth-primary-container eth-glow-cyan mb-6">
                        <Fingerprint size={32} strokeWidth={1.5} />
                    </div>

                    <h1 className="text-3xl font-bold text-on-surface mb-2 tracking-tight text-center">
                        {config.companyName ? t('titleWithCompany', { company: config.companyName }) : t('title')}
                    </h1>
                    <p className="text-on-surface-variant text-center mb-8 text-sm">
                        {t('prompt')}
                    </p>

                    {errorMsg && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="w-full bg-eth-danger/10 border border-eth-danger/40 rounded-xl p-4 mb-6 flex items-start space-x-3 text-eth-danger"
                        >
                            <ShieldAlert className="shrink-0 mt-0.5" size={18} />
                            <p className="text-sm leading-relaxed">{errorMsg}</p>
                        </motion.div>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="w-full bg-on-surface text-surface hover:brightness-110 disabled:opacity-70 disabled:cursor-not-allowed font-semibold py-3.5 px-6 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center space-x-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-eth-primary-container/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                <span>{t('signInWithGoogle')}</span>
                            </>
                        )}
                    </button>

                    <div className="mt-8 flex flex-col items-center space-y-1 text-on-surface-variant text-xs">
                        <p>{t('footer.tagline')}</p>
                        <p>{t('footer.lastUpdate')}</p>
                        <p>
                            <a
                                href={t('footer.authorUrl')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-colors hover:text-on-surface hover:underline underline-offset-2"
                            >
                                {t('footer.author')}
                            </a>
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
