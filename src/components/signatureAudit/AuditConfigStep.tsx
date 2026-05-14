import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader, Search, Zap } from 'lucide-react';
import { templatesApi, groupsApi, type AuditScope, type AuditDepth } from '../../services/server-api';
import { adminApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface AuditConfigStepProps {
    onStart: (config: { scope: AuditScope; templateId: number; depth: AuditDepth }) => void;
}

type ScopeType = 'all' | 'group' | 'orgUnit';
interface TemplateOpt { id: number; name: string; isDefault: boolean }
interface GroupOpt { email: string; name: string }
interface OrgUnitOpt { orgUnitPath: string; name: string }

const SELECT_CLASS =
    'w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/30 rounded-lg ' +
    'text-on-surface focus:ring-2 focus:ring-eth-primary focus:border-eth-primary';

export function AuditConfigStep({ onStart }: AuditConfigStepProps) {
    const { t } = useTranslation('signatureAudit');
    const { addToast } = useToast();

    const [scopeType, setScopeType] = useState<ScopeType>('all');
    const [scopeValue, setScopeValue] = useState('');
    const [templateId, setTemplateId] = useState<number | ''>('');
    const [depth, setDepth] = useState<AuditDepth>('fast');

    const [templates, setTemplates] = useState<TemplateOpt[]>([]);
    const [groups, setGroups] = useState<GroupOpt[]>([]);
    const [orgUnits, setOrgUnits] = useState<OrgUnitOpt[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [tpls, grpRes, ouRes] = await Promise.all([
                    templatesApi.getAll(),
                    groupsApi.list({ maxResults: 200 }),
                    adminApi.getOrgUnits() as Promise<{ orgUnits?: Array<{ orgUnitPath: string; name?: string }> }>,
                ]);
                const tplList: TemplateOpt[] = (tpls as any[]).map((x) => ({
                    id: x.id,
                    name: x.name,
                    isDefault: !!(x.isDefault ?? x.is_default),
                }));
                setTemplates(tplList);
                const def = tplList.find((x) => x.isDefault);
                if (def) setTemplateId(def.id);
                setGroups((grpRes?.groups || []).map((g) => ({ email: g.email, name: g.name || g.email })));
                setOrgUnits(
                    (ouRes?.orgUnits || []).map((o) => ({ orgUnitPath: o.orgUnitPath, name: o.name || o.orgUnitPath })),
                );
            } catch (err: any) {
                addToast(t('toast.loadFailed', { error: err?.message || String(err) }), 'error');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const canStart = templateId !== '' && (scopeType === 'all' || scopeValue !== '');

    const handleStart = () => {
        if (templateId === '') return;
        if (scopeType !== 'all' && !scopeValue) return;
        onStart({
            scope: { type: scopeType, value: scopeType === 'all' ? undefined : scopeValue },
            templateId,
            depth,
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader size={32} className="animate-spin text-eth-primary" />
                <p className="text-on-surface-variant font-medium">{t('config.loading')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Kapsam */}
            <div>
                <h3 className="text-sm font-semibold text-on-surface mb-3">{t('config.scope.heading')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['all', 'group', 'orgUnit'] as ScopeType[]).map((type) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => { setScopeType(type); setScopeValue(''); }}
                            className={`px-3 py-2.5 text-sm rounded-lg border text-left transition-colors ${
                                scopeType === type
                                    ? 'bg-eth-primary-container/15 text-eth-primary border-eth-primary-container/40'
                                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container-high'
                            }`}
                        >
                            {t(`config.scope.${type}`)}
                        </button>
                    ))}
                </div>

                {scopeType === 'group' && (
                    <select
                        className={`${SELECT_CLASS} mt-3`}
                        value={scopeValue}
                        onChange={(e) => setScopeValue(e.target.value)}
                    >
                        <option value="">{t('config.scope.groupPlaceholder')}</option>
                        {groups.map((g) => (
                            <option key={g.email} value={g.email}>{g.name} ({g.email})</option>
                        ))}
                    </select>
                )}
                {scopeType === 'orgUnit' && (
                    <select
                        className={`${SELECT_CLASS} mt-3`}
                        value={scopeValue}
                        onChange={(e) => setScopeValue(e.target.value)}
                    >
                        <option value="">{t('config.scope.orgUnitPlaceholder')}</option>
                        {orgUnits.map((o) => (
                            <option key={o.orgUnitPath} value={o.orgUnitPath}>{o.name} ({o.orgUnitPath})</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Şablon */}
            <div>
                <h3 className="text-sm font-semibold text-on-surface mb-3">{t('config.template.heading')}</h3>
                <select
                    className={SELECT_CLASS}
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : '')}
                >
                    <option value="">{t('config.template.placeholder')}</option>
                    {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                            {tpl.name}{tpl.isDefault ? ` ${t('config.template.defaultSuffix')}` : ''}
                        </option>
                    ))}
                </select>
                {templates.length === 0 && (
                    <p className="text-xs text-eth-danger mt-1.5">{t('config.template.empty')}</p>
                )}
            </div>

            {/* Derinlik */}
            <div>
                <h3 className="text-sm font-semibold text-on-surface mb-3">{t('config.depth.heading')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['fast', 'deep'] as AuditDepth[]).map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDepth(d)}
                            className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                                depth === d
                                    ? 'bg-eth-primary-container/15 border-eth-primary-container/40'
                                    : 'bg-surface-container-low border-outline-variant/30 hover:bg-surface-container-high'
                            }`}
                        >
                            <div className={`flex items-center gap-1.5 text-sm font-medium ${depth === d ? 'text-eth-primary' : 'text-on-surface'}`}>
                                {d === 'fast' ? <Zap size={15} /> : <Search size={15} />}
                                {t(`config.depth.${d}.label`)}
                            </div>
                            <p className="text-xs text-on-surface-variant mt-1">{t(`config.depth.${d}.desc`)}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    type="button"
                    onClick={handleStart}
                    disabled={!canStart}
                    className="px-5 py-2.5 text-sm font-medium rounded-lg bg-eth-primary-container text-on-eth-primary-container hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {t('config.start')}
                </button>
            </div>
        </div>
    );
}
