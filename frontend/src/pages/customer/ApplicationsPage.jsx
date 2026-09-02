/** "My applications" — the customer's own application history. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, ArrowRight } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { http } from '../../lib/api.js';
import { currency, date, titleCase } from '../../lib/format.js';
import { APPLICATION_STATUS_OPTIONS } from '../../lib/constants.js';

export default function CustomerApplicationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['applications', 'mine', { page, status }],
    queryFn: () => http.list('/applications', { params: { page, limit: 10, status } }),
  });

  const columns = [
    {
      key: 'applicationNo',
      header: 'Application',
      render: (row) => (
        <span className="font-mono text-[13px] font-medium text-slate-900">{row.applicationNo}</span>
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
      hideBelow: 'sm',
      render: (row) => `${row.tenureRequested} mo`,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      hideBelow: 'md',
      render: (row) => titleCase(row.purpose),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'createdAt',
      header: 'Applied on',
      hideBelow: 'lg',
      render: (row) => date(row.createdAt),
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
            navigate(`/app/applications/${row._id}`);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.customerApplications.root}>
      <PageHeader
        title="My applications"
        subtitle="Every loan application you have started, with its current status."
        actions={
          <Button
            icon={Plus}
            onClick={() => navigate('/app/apply')}
            data-testid={TESTIDS.customerApplications.newApplication}
          >
            New application
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.customerApplications.table}
        testIdPrefix={TESTIDS.customerApplications.row}
        onRowClick={(row) => navigate(`/app/applications/${row._id}`)}
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: (value) => {
              setStatus(value);
              setPage(1);
            },
            options: APPLICATION_STATUS_OPTIONS,
            testId: TESTIDS.customerApplications.statusFilter,
          },
        ]}
        emptyIcon={FileText}
        emptyTitle="No applications yet"
        emptyMessage="Apply for your first loan — you will get an indicative decision within minutes."
        emptyTestId={TESTIDS.customerApplications.empty}
        emptyAction={
          <Button className="mt-4" icon={Plus} onClick={() => navigate('/app/apply')} data-testid={TESTIDS.common.emptyStateAction}>
            Apply for a loan
          </Button>
        }
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
