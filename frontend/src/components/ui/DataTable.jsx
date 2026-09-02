/**
 * Data table with search, filters, status chips, pagination and per-row testids.
 *
 * Responsive strategy: the table scrolls horizontally inside its own container
 * on narrow screens (the page body never scrolls sideways), and columns marked
 * `hideBelow` drop out at that breakpoint. A row keeps the SAME testid at every
 * breakpoint, per the responsive testid rule.
 */
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { TESTIDS, rowId, cellId } from '@shared/testIds.js';
import { cn } from '../../lib/utils.js';
import Button from './Button.jsx';
import { Input, Select } from './Field.jsx';
import { EmptyState, TableSkeleton, ErrorState } from './States.jsx';

const HIDE_CLASSES = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

/**
 * @param {object} props
 * @param {Array<{key:string,header:string,render?:Function,align?:'left'|'right'|'center',hideBelow?:string,width?:string}>} props.columns
 * @param {Array<object>} props.rows
 * @param {string} props.testIdPrefix  e.g. 'admin-applications' -> rows become 'admin-applications-row-{id}'
 * @param {Function} [props.rowKey]    defaults to `row._id`
 * @param {Function} [props.onRowClick]
 */
export function DataTable({
  columns,
  rows = [],
  loading = false,
  error = null,
  onRetry,
  testIdPrefix,
  tableTestId,
  rowKey = (row) => row._id,
  onRowClick,
  emptyTitle = 'No records yet',
  emptyMessage,
  emptyIcon,
  emptyAction,
  emptyTestId,
  toolbar,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchTestId,
  filters = [],
  pagination,
  onPageChange,
  className,
}) {
  const hasToolbar = onSearchChange || filters.length > 0 || toolbar;

  return (
    <div className={cn('card overflow-hidden', className)}>
      {hasToolbar ? (
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {onSearchChange ? (
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  testId={searchTestId}
                  aria-label={searchPlaceholder}
                  className="[&_input]:pl-9"
                />
              </div>
            ) : null}

            {filters.map((filter) => (
              <Select
                key={filter.testId || filter.label}
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                options={filter.options}
                testId={filter.testId}
                aria-label={filter.label}
                className="sm:w-48"
              />
            ))}
          </div>

          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton columns={Math.min(columns.length, 6)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          message={emptyMessage}
          action={emptyAction}
          testId={emptyTestId}
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table" data-testid={tableTestId}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideBelow && HIDE_CLASSES[column.hideBelow]
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = rowKey(row) ?? index;
                return (
                  <tr
                    key={key}
                    data-testid={testIdPrefix ? rowId(testIdPrefix, key) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        data-testid={testIdPrefix ? cellId(testIdPrefix, key, column.key) : undefined}
                        className={cn(
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                          column.hideBelow && HIDE_CLASSES[column.hideBelow]
                        )}
                      >
                        {column.render ? column.render(row) : (row[column.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total > 0 && pagination.totalPages > 1 ? (
        <Pagination pagination={pagination} onPageChange={onPageChange} />
      ) : null}
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  const { page, limit, total, totalPages } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      data-testid={TESTIDS.common.pagination}
      className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row"
    >
      <p data-testid={TESTIDS.common.paginationInfo} className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          data-testid={TESTIDS.common.paginationPrev}
        >
          Previous
        </Button>
        <span className="px-1 text-xs text-slate-500">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronRight}
          iconRight
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          data-testid={TESTIDS.common.paginationNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default DataTable;
