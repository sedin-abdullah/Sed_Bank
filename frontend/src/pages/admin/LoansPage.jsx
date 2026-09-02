/** Loan-book listing for ops and collections. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ArrowRight } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { http } from '../../lib/api.js';
import { currency, date } from '../../lib/format.js';
import { LOAN_STATUS_OPTIONS, BUCKET_LABELS, DELINQUENCY_BUCKETS } from '../../lib/constants.js';
import { debounce } from '../../lib/utils.js';

export default function AdminLoansPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [bucket, setBucket] = useState('all');
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
    queryKey: ['loans', 'admin', { page, status, bucket, search }],
    queryFn: () =>
      http.list('/loans', {
        params: { page, limit: 15, status, bucket, ...(search ? { search } : {}) },
      }),
  });

  const columns = [
    {
      key: 'loanNo',
      header: 'Loan account',
      render: (row) => (
        <div>
          <p className="font-mono text-[13px] font-medium text-slate-900">{row.loanNo}</p>
          <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{row.borrower?.name}</p>
        </div>
      ),
    },
    {
      key: 'borrower',
      header: 'Borrower',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.borrower?.name ?? '—'}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.borrower?.mobile}</p>
        </div>
      ),
    },
    {
      key: 'sanctionedAmount',
      header: 'Sanctioned',
      align: 'right',
      render: (row) => currency(row.sanctionedAmount),
    },
    {
      key: 'principalOutstanding',
      header: 'Outstanding',
      align: 'right',
      hideBelow: 'md',
      render: (row) => currency(row.principalOutstanding),
    },
    {
      key: 'emiAmount',
      header: 'EMI',
      align: 'right',
      hideBelow: 'xl',
      render: (row) => currency(row.emiAmount, { decimals: 2 }),
    },
    {
      key: 'bucket',
      header: 'Ageing',
      hideBelow: 'lg',
      render: (row) =>
        row.bucket === 'current' ? (
          <Badge tone="neutral">Current</Badge>
        ) : (
          <Badge tone={row.dpd > 60 ? 'danger' : 'warning'}>
            {BUCKET_LABELS[row.bucket]} · {row.dpd}d
          </Badge>
        ),
    },
    {
      key: 'overdueAmount',
      header: 'Overdue',
      align: 'right',
      render: (row) =>
        row.overdueAmount > 0 ? (
          <span className="font-medium text-danger-600">{currency(row.overdueAmount)}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'disbursedAt',
      header: 'Disbursed',
      hideBelow: 'xl',
      render: (row) => date(row.disbursedAt),
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
            navigate(`/admin/loans/${row._id}`);
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminLoans.root}>
      <PageHeader
        title="Loan accounts"
        subtitle="The full loan book: balances, ageing and repayment status."
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminLoans.table}
        testIdPrefix={TESTIDS.adminLoans.row}
        onRowClick={(row) => navigate(`/admin/loans/${row._id}`)}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by loan no, borrower name, email…"
        searchTestId={TESTIDS.adminLoans.searchInput}
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: (value) => {
              setStatus(value);
              setPage(1);
            },
            options: LOAN_STATUS_OPTIONS,
            testId: TESTIDS.adminLoans.statusFilter,
          },
          {
            label: 'Ageing bucket',
            value: bucket,
            onChange: (value) => {
              setBucket(value);
              setPage(1);
            },
            options: [
              { value: 'all', label: 'All buckets' },
              ...DELINQUENCY_BUCKETS.map((key) => ({ value: key, label: BUCKET_LABELS[key] })),
            ],
          },
        ]}
        emptyIcon={Wallet}
        emptyTitle={search ? 'No matching loan accounts' : 'No loans disbursed yet'}
        emptyMessage={
          search
            ? 'Try a different search term or clear the filters.'
            : 'Loan accounts are created the moment an approved application is disbursed.'
        }
        emptyTestId={TESTIDS.adminLoans.empty}
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
