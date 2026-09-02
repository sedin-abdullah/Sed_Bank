/** Platform-wide audit trail — every state-changing action, newest first. */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { http } from '../../lib/api.js';
import { dateTime, titleCase } from '../../lib/format.js';
import { debounce } from '../../lib/utils.js';

/** Colour the action chip by what kind of event it is. */
const toneForAction = (action) => {
  if (/reject|delete|deactivat|fail/i.test(action)) return 'danger';
  if (/approve|verified|disbursed|payment|created/i.test(action)) return 'success';
  if (/sent_back|overdue|reminder|warning/i.test(action)) return 'warning';
  return 'neutral';
};

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const apply = debounce((value) => {
      setSearch(value);
      setPage(1);
    }, 350);
    apply(searchInput);
    return () => apply.cancel();
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', { page, search }],
    queryFn: () => http.list('/audit', { params: { page, limit: 25, ...(search ? { search } : {}) } }),
  });

  const columns = [
    {
      key: 'timestamp',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600">{dateTime(row.timestamp)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={toneForAction(row.action)}>{row.action}</Badge>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="block max-w-md break-words text-slate-700">
          {row.description || titleCase(row.action)}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      hideBelow: 'lg',
      render: (row) => <span className="text-xs text-slate-500">{row.entity}</span>,
    },
    {
      key: 'performedByName',
      header: 'By',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-900">{row.performedByName}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{titleCase(row.role)}</p>
        </div>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminAudit.root}>
      <PageHeader
        title="Audit trail"
        subtitle="An append-only record of every state-changing action taken in SedBank."
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminAudit.table}
        testIdPrefix={TESTIDS.adminAudit.row}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by action, description or user…"
        searchTestId={TESTIDS.adminAudit.searchInput}
        emptyIcon={ScrollText}
        emptyTitle={search ? 'No matching entries' : 'No activity recorded yet'}
        emptyMessage={
          search
            ? 'Try a different search term.'
            : 'Actions taken in either portal are logged here automatically.'
        }
        emptyTestId={TESTIDS.adminAudit.empty}
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
