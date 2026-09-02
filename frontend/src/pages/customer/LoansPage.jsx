/** "My loans" — every loan account the customer holds, active or closed. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ArrowRight } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { http } from '../../lib/api.js';
import { currency, date } from '../../lib/format.js';
import { LOAN_STATUS_OPTIONS } from '../../lib/constants.js';

export default function CustomerLoansPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loans', 'mine', { page, status }],
    queryFn: () => http.list('/loans', { params: { page, limit: 10, status } }),
  });

  const columns = [
    {
      key: 'loanNo',
      header: 'Loan account',
      render: (row) => (
        <span className="font-mono text-[13px] font-medium text-slate-900">{row.loanNo}</span>
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
      render: (row) => currency(row.principalOutstanding),
    },
    {
      key: 'emiAmount',
      header: 'EMI',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => currency(row.emiAmount, { decimals: 2 }),
    },
    {
      key: 'roi',
      header: 'Rate',
      align: 'right',
      hideBelow: 'lg',
      render: (row) => `${row.roi}%`,
    },
    {
      key: 'disbursedAt',
      header: 'Disbursed',
      hideBelow: 'lg',
      render: (row) => date(row.disbursedAt),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {row.overdueAmount > 0 ? (
            <span className="text-[11px] font-medium text-danger-600">
              {currency(row.overdueAmount)} overdue
            </span>
          ) : null}
        </div>
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
            navigate(`/app/loans/${row._id}`);
          }}
        >
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.customerLoans.root}>
      <PageHeader title="My loans" subtitle="Your loan accounts, balances and repayment status." />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.customerLoans.table}
        testIdPrefix={TESTIDS.customerLoans.row}
        onRowClick={(row) => navigate(`/app/loans/${row._id}`)}
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: (value) => {
              setStatus(value);
              setPage(1);
            },
            options: LOAN_STATUS_OPTIONS,
          },
        ]}
        emptyIcon={Wallet}
        emptyTitle="No loans yet"
        emptyMessage="Once an application is approved and disbursed, the loan account will appear here."
        emptyTestId={TESTIDS.customerLoans.empty}
        emptyAction={
          <Button className="mt-4" onClick={() => navigate('/app/apply')} data-testid={TESTIDS.common.emptyStateAction}>
            Apply for a loan
          </Button>
        }
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
