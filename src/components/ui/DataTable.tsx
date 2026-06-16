import { ReactNode, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface Column<Row> {
    key: string;
    header: ReactNode;
    /** Renders the cell content; use when the default `row[key]` render is not enough. */
    render?: (row: Row) => ReactNode;
    /** Whether the column is sortable. Sorting needs both sortable + accessor. */
    sortable?: boolean;
    /** fn that extracts the sort value from a row (falls back to row[key]). */
    accessor?: (row: Row) => string | number | Date | null | undefined;
    /** Column width (Tailwind class). */
    width?: string;
    /** Cell class. */
    cellClassName?: string;
    /** Header class. */
    headerClassName?: string;
    align?: 'left' | 'right' | 'center';
}

interface DataTableProps<Row> {
    columns: Column<Row>[];
    rows: Row[];
    rowKey: (row: Row) => string;
    loading?: boolean;
    emptyTitle?: ReactNode;
    emptyDescription?: ReactNode;
    emptyIcon?: ReactNode;
    onRowClick?: (row: Row) => void;
    className?: string;
    /** How many skeleton rows to show while loading. */
    loadingRows?: number;
}

type SortDir = 'asc' | 'desc';

interface SortState {
    key: string;
    dir: SortDir;
}

const ALIGN_CLASSES: Record<NonNullable<Column<unknown>['align']>, string> = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
};

/**
 * Minimal in-house DataTable wrapper — a shared skeleton for the table markup
 * of pages like Users, GroupsList, JobHistory, Reports. Sorting is optional;
 * pagination is left to the calling page (the rows prop already comes paged).
 */
export function DataTable<Row>({
    columns,
    rows,
    rowKey,
    loading,
    emptyTitle,
    emptyDescription,
    emptyIcon,
    onRowClick,
    className,
    loadingRows = 5,
}: DataTableProps<Row>) {
    const [sort, setSort] = useState<SortState | null>(null);

    const sortedRows = useMemo(() => {
        if (!sort) return rows;
        const col = columns.find((c) => c.key === sort.key);
        if (!col || !col.sortable) return rows;
        const accessor = col.accessor ?? ((row: Row) => (row as Record<string, unknown>)[col.key] as string | number);
        const sorted = [...rows].sort((a, b) => {
            const av = accessor(a);
            const bv = accessor(b);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return sort.dir === 'asc' ? -1 : 1;
            if (av > bv) return sort.dir === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [rows, sort, columns]);

    const handleSort = (key: string) => {
        const col = columns.find((c) => c.key === key);
        if (!col?.sortable) return;
        setSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
        });
    };

    if (!loading && rows.length === 0) {
        return (
            <div className={clsx('bg-surface-container border border-outline-variant/30 rounded-xl', className)}>
                <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle ?? 'No data'}
                    description={emptyDescription}
                />
            </div>
        );
    }

    return (
        <div className={clsx('bg-surface-container border border-outline-variant/30 shadow-sm rounded-xl overflow-hidden', className)}>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-surface-container-high/60">
                        <tr>
                            {columns.map((col) => {
                                const align = col.align ?? 'left';
                                const isSorted = sort?.key === col.key;
                                return (
                                    <th
                                        key={col.key}
                                        scope="col"
                                        aria-sort={
                                            isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                                        }
                                        className={clsx(
                                            'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant',
                                            ALIGN_CLASSES[align],
                                            col.width,
                                            col.headerClassName,
                                            col.sortable && 'cursor-pointer select-none hover:text-on-surface',
                                        )}
                                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {col.header}
                                            {col.sortable && isSorted && (
                                                sort?.dir === 'asc' ? (
                                                    <ChevronUp className="h-3 w-3" aria-hidden />
                                                ) : (
                                                    <ChevronDown className="h-3 w-3" aria-hidden />
                                                )
                                            )}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? Array.from({ length: loadingRows }).map((_, ri) => (
                                  <tr key={`skeleton-${ri}`} className="border-t border-outline-variant/30">
                                      {columns.map((col) => (
                                          <td key={col.key} className="px-4 py-3">
                                              <Skeleton variant="text" />
                                          </td>
                                      ))}
                                  </tr>
                              ))
                            : sortedRows.map((row) => {
                                  const key = rowKey(row);
                                  return (
                                      <tr
                                          key={key}
                                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                                          className={clsx(
                                              'border-t border-outline-variant/30 transition-colors',
                                              onRowClick && 'cursor-pointer hover:bg-surface-container-high/40',
                                          )}
                                      >
                                          {columns.map((col) => {
                                              const align = col.align ?? 'left';
                                              const value = col.render
                                                  ? col.render(row)
                                                  : ((row as Record<string, unknown>)[col.key] as ReactNode);
                                              return (
                                                  <td
                                                      key={col.key}
                                                      className={clsx(
                                                          'px-4 py-3 text-on-surface',
                                                          ALIGN_CLASSES[align],
                                                          col.cellClassName,
                                                      )}
                                                  >
                                                      {value as ReactNode}
                                                  </td>
                                              );
                                          })}
                                      </tr>
                                  );
                              })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
