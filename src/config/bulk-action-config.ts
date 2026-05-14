import type { BulkActionType } from '../types/admin';

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
    requiredColumns: ['email'],
    icon: 'UserX',
  },
  delete: {
    type: 'delete',
    label: 'Sil',
    description: 'Seçili kullanıcıları kalıcı olarak siler',
    requiredColumns: ['email'],
    icon: 'Trash2',
  },
  signature_push: {
    type: 'signature_push',
    label: 'İmza Gönder',
    description: 'Gmail imzasını günceller ve profili senkronize eder',
    requiredColumns: ['email', 'ad', 'soyad', 'unvan', 'kurum_adi', 'telefon'],
    icon: 'FileSignature',
  },
};
