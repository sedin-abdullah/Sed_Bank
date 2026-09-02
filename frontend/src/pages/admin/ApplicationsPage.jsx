/**
 * Underwriting worklist.
 *
 * New submissions arrive over Socket.IO (SocketContext invalidates the
 * `applications` query), so the table updates without a refresh — the "Live"
 * badge in the toolbar reflects the socket connection.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, RefreshCw, ArrowRight, Radio } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { http } from '../../lib/api.js';
import { currency, timeAgo, titleCase } from '../../lib/format.js';
import { APPLICATION_STATUS_OPTIONS } from '../../lib/constants.js';
import { debounce, cn } from '../../lib/utils.js';

export default function AdminApplicationsPage() {
  const navigate = useNavigate();
  const { connected } = useSocket();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('queue');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const apply = debounce((value) => {
      setSearch(value);
      setPage(1);
    }, 350);
    apply(searchInput);
    return () => apply.cancel();
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['applications', 'worklist', { page, status, search }],
    queryFn: () =>
      http.list('/applications', { params: { page, limit: 15, status, ...(search ? { search } : {}) } }),
  });

  const columns = [
    {
      key: 'applicationNo',
      header: 'Application',
      render: (row) => (
        <div>
          <p className="font-mono text-[13px] font-medium text-slate-900">{row.applicationNo}</p>
          <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{row.applicant?.name}</p>
        </div>
      ),
    },
    {
      key: 'applicant',
      header: 'Applicant',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.applicant?.name ?? '—'}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.applicant?.email}</p>
        </div>
      ),
    },
    {
      key: 'amountRequested',
      header: 'Amount',
      align: 'right',
      render: (row) => currency(row.amountRequested),
    },
    {
      key: 'tenureRequested',
      header: 'Tenure',
      align: 'right',
      hideBelow: 'lg',
      render: (row) => `${row.tenureRequested} mo`,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      hideBelow: 'xl',
      render: (row) => titleCase(row.purpose),
    },
    {
      key: 'bureauScore',
      header: 'Score',
      align: 'right',
      hideBelow: 'md',
      render: (row) =>
        row.bureauScore ? (
          <Badge tone={row.bureauScore >= 750 ? 'success' : row.bureauScore >= 650 ? 'warning' : 'danger'}>
            {row.bureauScore}
          </Badge>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      hideBelow: 'lg',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {timeAgo(row.submittedAt || row.createdAt)}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          icon={ArrowRight}
          iconRight
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/admin/applications/${row._id}`);
          }}
        >
          Review
        </Button>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminApplications.root}>
      <PageHeader
        title="Applications"
        subtitle="Review submitted applications, run credit decisions and hand off for disbursement."
        actions={
          <span
            data-testid={TESTIDS.adminApplications.liveBadge}
            data-connected={connected ? 'true' : 'false'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
              connected ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-slate-500'
            )}
          >
            <Radio className="h-3 w-3" />
            {connected ? 'Live — new applications appear automatically' : 'Reconnecting…'}
          </span>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminApplications.table}
        testIdPrefix={TESTIDS.adminApplications.row}
        onRowClick={(row) => navigate(`/admin/applications/${row._id}`)}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by application no, name, email…"
        searchTestId={TESTIDS.adminApplications.searchInput}
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: (value) => {
              setStatus(value);
              setPage(1);
            },
            options: APPLICATION_STATUS_OPTIONS,
            testId: TESTIDS.adminApplications.statusFilter,
          },
        ]}
        toolbar={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={isFetching && !isLoading}
            onClick={() => refetch()}
            data-testid={TESTIDS.adminApplications.refresh}
          >
            Refresh
          </Button>
        }
        emptyIcon={ClipboardList}
        emptyTitle={search || status !== 'queue' ? 'No matching applications' : 'The queue is clear'}
        emptyMessage={
          search || status !== 'queue'
            ? 'Try a different search term or status filter.'
            : 'No applications are waiting for a credit decision right now. New submissions appear here automatically.'
        }
        emptyTestId={TESTIDS.adminApplications.empty}
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
