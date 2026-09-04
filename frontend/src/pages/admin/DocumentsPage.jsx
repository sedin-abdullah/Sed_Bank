/** Ops document-verification queue — everything still awaiting a check. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Check, X, ExternalLink } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { dateTime, titleCase, fileSize } from '../../lib/format.js';

export default function AdminDocumentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  /**
   * Opens a document in a new tab. The bytes come from an authorised endpoint,
   * so this fetches them with the session token rather than letting the
   * browser navigate — a plain link would arrive unauthenticated.
   */
  const openDocument = async (doc) => {
    try {
      await http.openFile(`/documents/${doc._id}/file`);
    } catch (err) {
      toast.error('Cannot open this document', err.message);
    }
  };
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pending-documents', { page }],
    queryFn: () => http.list('/documents/pending', { params: { page, limit: 15 } }),
  });

  const verify = useMutation({
    mutationFn: ({ documentId, status }) =>
      http.patch(`/documents/${documentId}/verify`, {
        status,
        remarks: status === 'rejected' ? 'Not legible or does not match the application.' : 'Verified.',
      }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['application'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Document ${variables.status}`);
    },
    onError: (err) => toast.error('Could not update the document', err.message),
  });

  const columns = [
    {
      key: 'type',
      header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{titleCase(row.type)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {row.originalName} · {fileSize(row.sizeBytes)}
          </p>
        </div>
      ),
    },
    {
      key: 'application',
      header: 'Application',
      render: (row) => (
        <button
          type="button"
          className="link font-mono text-[13px]"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/admin/applications/${row.application?._id}`);
          }}
        >
          {row.application?.applicationNo ?? '—'}
        </button>
      ),
    },
    {
      key: 'owner',
      header: 'Applicant',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-slate-900">{row.owner?.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.owner?.email}</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      hideBelow: 'lg',
      render: (row) => dateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openDocument(row);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:bg-white/10"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </button>
          <button
            type="button"
            data-testid={TESTIDS.adminDocuments.verify}
            onClick={(event) => {
              event.stopPropagation();
              verify.mutate({ documentId: row._id, status: 'verified' });
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-success-700 transition hover:bg-success-50"
          >
            <Check className="h-3.5 w-3.5" />
            Verify
          </button>
          <button
            type="button"
            data-testid={TESTIDS.adminDocuments.reject}
            onClick={(event) => {
              event.stopPropagation();
              verify.mutate({ documentId: row._id, status: 'rejected' });
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-danger-600 transition hover:bg-danger-50"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminDocuments.root}>
      <PageHeader
        title="Document queue"
        subtitle="Verify supporting documents before a loan can be disbursed."
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminDocuments.table}
        testIdPrefix={TESTIDS.adminDocuments.row}
        emptyIcon={FileCheck2}
        emptyTitle="Nothing to verify"
        emptyMessage="Every uploaded document has been reviewed. New uploads appear here automatically."
        emptyTestId={TESTIDS.adminDocuments.empty}
        pagination={data?.meta}
        onPageChange={setPage}
      />
    </div>
  );
}
