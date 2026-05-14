import type { BulkActionType } from '../types/admin';
import { CANONICAL_COLUMNS } from '../utils/bulkColumns';

export interface BulkActionConfig {
  type: BulkActionType;
  label: string;
  description: string;
  requiredColumns: string[];
  icon: string;
}

export const BULK_ACTION_CONFIGS: Record<BulkActionType, BulkActionConfig> = {
  suspend: {
    type: 'suspend',
    label: 'Askıya Al',
    description: 'Seçili kullanıcıları askıya alır',
    requiredColumns: CANONICAL_COLUMNS.suspend,
    icon: 'UserX',
  },
  delete: {
    type: 'delete',
    label: 'Sil',
    description: 'Seçili kullanıcıları kalıcı olarak siler',
    requiredColumns: CANONICAL_COLUMNS.delete,
    icon: 'Trash2',
  },
  signature_push: {
    type: 'signature_push',
    label: 'İmza Gönder',
    description: 'Gmail imzasını günceller ve profili senkronize eder',
    requiredColumns: CANONICAL_COLUMNS.signature_push,
    icon: 'FileSignature',
  },
};
