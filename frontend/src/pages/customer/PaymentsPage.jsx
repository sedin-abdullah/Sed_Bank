/** The customer's full payment ledger across all their loans. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { http } from '../../lib/api.js';
import { currency, dateTime, titleCase } from '../../lib/format.js';
import { PAYMENT_TYPES } from '../../lib/constants.js';

export default function CustomerPaymentsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payments', 'mine', { page, type }],
    queryFn: () => http.list('/payments', { params: { page, limit: 15, type } }),
  });

  const columns = [
    {
      key: 'paymentNo',
      header: 'Receipt',
      render: (row) => <span className="font-mono text-[13px]">{row.paymentNo}</span>,
    },
    {
      key: 'loanAccount',
      header: 'Loan',
      render: (row) => (
        <button
          type="button"
          className="link"
          onClick={() => row.loanAccount?._id && navigate(`/app/loans/${row.loanAccount._id}`)}
        >
          {row.loanAccount?.loanNo ?? '—'}
        </button>
      ),
    },
    { key: 'paidAt', header: 'Date', render: (row) => dateTime(row.paidAt) },
    { key: 'type', header: 'Type', hideBelow: 'sm', render: (row) => titleCase(row.type) },
    { key: 'mode', header: 'Mode', hideBelow: 'lg', render: (row) => titleCase(row.mode) },
    {
      key: 'principalComponent',
      header: 'Principal',
      align: 'right',
      hideBelow: 'md',
      render: (row) => currency(row.principalComponent, { decimals: 2 }),
    },
    {
      key: 'interestComponent',
      header: 'Interest',
      align: 'right',
      hideBelow: 'md',
      render: (row) => currency(row.interestComponent, { decimals: 2 }),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="font-semibold text-success-700">
          {currency(row.amount, { decimals: 2 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div data-testid={TESTIDS.customerPayments.root}>
      <PageHeader
        title="Payments"
        subtitle="Every payment you have made, with its principal and interest split."
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.customerPayments.table}
        testIdPrefix={TESTIDS.customerPayments.row}
        filters={[
          {
            label: 'Payment type',
            value: type,
            onChange: (value) => {
              setType(value);
              setPage(1);
            },
            options: [{ value: 'all', label: 'All types' }, ...PAYMENT_TYPES],
          },
        ]}
        emptyIcon={Receipt}
        emptyTitle="No payments yet"
        emptyMessage="Once you make your first EMI payment, the receipt will appear here."
        emptyTestId={TESTIDS.customerPayments.empty}
        emptyAction={
          <Button className="mt-4" variant="secondary" onClick={() => navigate('/app/loans')}>
            Go to my loans
          </Button>
        }
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
