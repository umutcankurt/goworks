import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ConfigWarningBanner } from '../components/ConfigWarningBanner';
import { SessionWarningModal } from '../components/SessionWarningModal';
import { SessionProvider } from '../contexts/SessionContext';
import { AnimatePresence, motion } from 'framer-motion';

export function AppLayout() {
    const location = useLocation();

    return (
        <SessionProvider>
            <div className="eth-app flex h-screen text-on-surface">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <ConfigWarningBanner />
                    <main className="flex-1 overflow-x-hidden overflow-y-auto relative">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="min-h-full px-8 pt-8 pb-12"
                            >
                                <Outlet />
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>
            <SessionWarningModal />
        </SessionProvider>
    );
}
