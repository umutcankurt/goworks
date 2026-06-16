import { motion } from 'framer-motion';
import { UserX, Trash2, FileSignature, UserPlus, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BulkActionType } from '../../types/admin';
import { BULK_ACTION_CONFIGS } from '../../config/bulk-action-config';
import { localeColumn } from '../../utils/bulkColumns';

interface ActionSelectorProps {
    onSelect: (action: BulkActionType) => void;
}

const ICONS: Record<string, React.ElementType> = {
    UserX,
    Trash2,
    FileSignature,
    UserPlus,
};

export const ActionSelector: React.FC<ActionSelectorProps> = ({ onSelect }) => {
    const actions = Object.values(BULK_ACTION_CONFIGS);
    const { t, i18n } = useTranslation('bulk');

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {actions.map((config) => {
                const Icon = ICONS[config.icon] || UserX;

                return (
                    <motion.button
                        key={config.type}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect(config.type)}
                        className="relative flex flex-col items-start p-5 rounded-xl border-2 border-outline-variant/30 bg-surface-container hover:border-eth-primary-container/60 hover:shadow-md cursor-pointer text-left transition-all"
                    >
                        <div className={`p-2.5 rounded-lg mb-3 ${
                            config.type === 'delete'
                                ? 'bg-eth-danger/15 text-eth-danger'
                                : config.type === 'signature_push'
                                ? 'bg-violet-500/15 text-violet-500'
                                : config.type === 'add_to_group'
                                ? 'bg-sky-500/15 text-sky-500'
                                : 'bg-amber-500/15 text-amber-500'
                        }`}>
                            <Icon size={22} />
                        </div>

                        <h3 className="text-base font-semibold text-on-surface mb-1">{t(`actions.${config.type}.label`)}</h3>
                        <p className="text-sm text-on-surface-variant mb-3">{t(`actions.${config.type}.description`)}</p>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {config.requiredColumns.map(col => (
                                <span key={col} className="text-xs bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-md font-mono">
                                    {localeColumn(col, i18n.language)}
                                </span>
                            ))}
                        </div>

                        <div className="flex items-center gap-1 text-xs text-eth-primary mt-auto font-medium">
                            <span>{t('actionSelector.select')}</span>
                            <ChevronRight size={14} />
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
};
