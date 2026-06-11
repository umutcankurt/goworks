import type { BulkActionType } from '../types/admin';
import { BULK_ACTION_CONFIGS } from '../config/bulk-action-config';
import { canonicalColumn } from './bulkColumns';

export function validateCsvColumns(
  rows: Record<string, string>[],
  actionType: BulkActionType
): { valid: boolean; missingColumns: string[] } {
  if (rows.length === 0) {
    return { valid: false, missingColumns: [] };
  }

  const config = BULK_ACTION_CONFIGS[actionType];
  if (!config) {
    return { valid: false, missingColumns: [] };
  }

  // CSV headers can be TR or EN → convert to canonical form before comparing.
  const existingColumns = Object.keys(rows[0]).map(c => canonicalColumn(c));
  const missingColumns = config.requiredColumns.filter(
    col => !existingColumns.includes(col)
  );

  return {
    valid: missingColumns.length === 0,
    missingColumns,
  };
}
