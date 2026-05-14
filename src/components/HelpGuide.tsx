import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    HelpCircle,
    X,
    BookOpen,
    Info,
    Building2,
    Tag,
    Phone,
    Mail,
    Users,
    Settings,
    Layers,
    List,
    Zap,
    Eye,
    Code,
    Ruler,
    FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

/* ---------- Tipler ---------- */
type CalloutTone = 'info' | 'tip' | 'warning';

interface GuideBullet {
    term?: string;
    desc: string;
}
interface GuideCallout {
    tone: CalloutTone;
    text: string;
}
interface GuideCode {
    label?: string;
    content: string;
    note?: string;
}
interface GuideTable {
    columns: string[];
    rows: string[][];
}
interface GuideSection {
    icon?: string;
    heading: string;
    badge?: string;
    paragraphs?: string[];
    code?: GuideCode[];
    table?: GuideTable;
    bullets?: GuideBullet[];
    callout?: GuideCallout;
}
interface HelpGuideProps {
    namespace: string;
}

/* ---------- Icon map ---------- */
const GUIDE_ICONS: Record<string, LucideIcon> = {
    info: Info,
    building: Building2,
    tag: Tag,
    phone: Phone,
    mail: Mail,
    users: Users,
    settings: Settings,
    layers: Layers,
    list: List,
    zap: Zap,
    eye: Eye,
    code: Code,
    ruler: Ruler,
    file: FileText,
};
const resolveIcon = (name?: string): LucideIcon => (name && GUIDE_ICONS[name]) || Info;

/* ---------- Callout stilleri ---------- */
const CALLOUT_STYLES: Record<CalloutTone, { wrap: string; icon: LucideIcon; iconColor: string }> = {
    info: { wrap: 'bg-eth-secondary/10 border-eth-secondary/30', icon: Info, iconColor: 'text-eth-secondary' },
    tip: { wrap: 'bg-teal-500/10 border-teal-500/30', icon: Zap, iconColor: 'text-teal-600' },
    warning: { wrap: 'bg-amber-500/10 border-amber-500/30', icon: Info, iconColor: 'text-amber-500' },
};

/* ---------- Runtime guard ---------- */
function isGuideSectionArray(value: unknown): value is GuideSection[] {
    return (
        Array.isArray(value) &&
        value.every(
            (s) =>
                typeof s === 'object' &&
                s !== null &&
                typeof (s as GuideSection).heading === 'string',
        )
    );
}

/* ---------- Inline rich text (<b> / <code> destekli) ---------- */
function RichText({ text }: { text: string }) {
    return (
        <Trans
            defaults={text}
            components={{
                b: <b className="font-semibold text-on-surface" />,
                code: (
                    <code className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/30 text-primary-700" />
                ),
            }}
        />
    );
}

/* ---------- Bölüm renderer ---------- */
function GuideSectionView({ section }: { section: GuideSection }) {
    const Icon = resolveIcon(section.icon);
    return (
        <section>
            <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-primary-600 shrink-0" />
                <h3 className="font-semibold text-on-surface">{section.heading}</h3>
                {section.badge && (
                    <span className="text-xs px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded border border-outline-variant/30">
                        {section.badge}
                    </span>
                )}
            </div>

            {section.paragraphs?.map((p, i) => (
                <p key={i} className="mb-2 text-on-surface-variant">
                    <RichText text={p} />
                </p>
            ))}

            {section.code && section.code.length > 0 && (
                <div className="space-y-3">
                    {section.code.map((block, i) => (
                        <div key={i}>
                            {block.label && (
                                <p className="text-xs font-medium text-on-surface-variant mb-1">{block.label}</p>
                            )}
                            <pre className="bg-surface-container-lowest text-on-surface rounded-lg px-3 py-2 text-xs overflow-x-auto leading-relaxed">
                                {block.content}
                            </pre>
                            {block.note && (
                                <p className="text-xs text-on-surface-variant mt-1">→ {block.note}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {section.table && (
                <div className="bg-surface-container-low rounded-lg border border-outline-variant/30 overflow-hidden mt-1">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-surface-container-high text-on-surface-variant">
                                {section.table.columns.map((col, i) => (
                                    <th key={i} className="text-left px-3 py-1.5 font-medium">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20">
                            {section.table.rows.map((row, ri) => (
                                <tr key={ri}>
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="px-3 py-1.5 text-on-surface-variant">
                                            <RichText text={cell} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {section.bullets && section.bullets.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-on-surface-variant mt-1">
                    {section.bullets.map((b, i) => (
                        <li key={i}>
                            {b.term && <b className="font-semibold text-on-surface">{b.term} </b>}
                            <RichText text={b.desc} />
                        </li>
                    ))}
                </ul>
            )}

            {section.callout &&
                (() => {
                    const c = CALLOUT_STYLES[section.callout!.tone] ?? CALLOUT_STYLES.info;
                    const CIcon = c.icon;
                    return (
                        <div
                            className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${c.wrap}`}
                        >
                            <CIcon size={14} className={`shrink-0 mt-0.5 ${c.iconColor}`} />
                            <span className="text-on-surface-variant">
                                <RichText text={section.callout!.text} />
                            </span>
                        </div>
                    );
                })()}
        </section>
    );
}

/* ---------- Ana bileşen ---------- */
export function HelpGuide({ namespace }: HelpGuideProps) {
    const { t } = useTranslation(namespace);
    const { t: tCommon } = useTranslation('common');
    const [open, setOpen] = useState(false);

    // Escape ile kapatma — document seviyesinde dinleyici
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const raw = t('guide.sections', { returnObjects: true });
    const sections: GuideSection[] = isGuideSectionArray(raw) ? raw : [];
    const label = tCommon('userGuide');

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant rounded-lg text-sm transition-colors shrink-0"
            >
                <HelpCircle size={16} />
                {label}
            </button>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                            onClick={() => setOpen(false)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/30 w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-modal="true"
                            >
                                <div className="sticky top-0 bg-surface-container border-b border-outline-variant/30 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                                    <div className="flex items-center gap-2">
                                        <BookOpen size={20} className="text-primary-600" />
                                        <h2 className="text-lg font-semibold text-on-surface">{label}</h2>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        className="p-1 hover:bg-surface-container-high rounded-lg transition-colors"
                                    >
                                        <X size={20} className="text-on-surface-variant" />
                                    </button>
                                </div>

                                <div className="px-6 py-5 space-y-6 text-sm text-on-surface">
                                    {sections.map((section, i) => (
                                        <div key={i}>
                                            {i > 0 && <hr className="border-outline-variant/30 mb-6" />}
                                            <GuideSectionView section={section} />
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
}
