/**
 * Partner bank / disbursement account master data.
 * Same "Add Bank" modal-CRUD pattern as the other Sed* admin consoles.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, Pencil, Trash2 } from 'lucide-react';
import { TESTIDS, actionId } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { FormError } from '../../components/ui/States.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { BANK_TYPES } from '../../lib/constants.js';
import { debounce, fieldErrorsOf } from '../../lib/utils.js';

const EMPTY_FORM = {
  name: '',
  code: '',
  type: 'disbursement',
  accountName: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  contactPerson: '',
  contactEmail: '',
  status: 'active',
};

export default function AdminBanksPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [type, setType] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    const apply = debounce((value) => {
      setSearch(value);
      setPage(1);
    }, 350);
    apply(searchInput);
    return () => apply.cancel();
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['banks', { page, type, search }],
    queryFn: () => http.list('/banks', { params: { page, limit: 15, type, ...(search ? { search } : {}) } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['banks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const saveBank = useMutation({
    mutationFn: (payload) =>
      editing ? http.patch(`/banks/${editing._id}`, payload) : http.post('/banks', payload),
    onMutate: () => {
      setFormError('');
      setErrors({});
    },
    onSuccess: () => {
      setModalOpen(false);
      invalidate();
      toast.success(editing ? 'Bank updated' : 'Bank added');
    },
    onError: (err) => {
      setFormError(err.message);
      setErrors(fieldErrorsOf(err));
    },
  });

  const removeBank = useMutation({
    mutationFn: (id) => http.delete(`/banks/${id}`),
    onSuccess: (result) => {
      setRemoving(null);
      invalidate();
      toast.success(result.deactivated ? 'Bank deactivated' : 'Bank deleted', result.message);
    },
    onError: (err) => {
      setRemoving(null);
      toast.error('Could not remove this bank', err.message);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      type: row.type,
      accountName: row.accountName || '',
      // The API masks stored account numbers; re-entering is deliberate.
      accountNumber: '',
      ifsc: row.ifsc || '',
      branch: row.branch || '',
      contactPerson: row.contactPerson || '',
      contactEmail: row.contactEmail || '',
      status: row.status,
    });
    setErrors({});
    setFormError('');
    setModalOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();

    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter the bank name.';
    if (!/^[A-Z0-9_-]{2,20}$/.test(form.code.toUpperCase()))
      next.code = 'Use 2–20 letters, numbers, hyphens or underscores.';
    if (form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber))
      next.accountNumber = 'Account number must be 9–18 digits.';
    if (form.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.toUpperCase()))
      next.ifsc = 'Enter a valid IFSC (e.g. HDFC0001234).';
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail))
      next.contactEmail = 'Enter a valid email address.';

    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      name: form.name.trim(),
      code: form.code.toUpperCase().trim(),
      type: form.type,
      accountName: form.accountName.trim(),
      branch: form.branch.trim(),
      contactPerson: form.contactPerson.trim(),
      contactEmail: form.contactEmail.trim().toLowerCase(),
      status: form.status,
      ...(form.accountNumber ? { accountNumber: form.accountNumber } : {}),
      ...(form.ifsc ? { ifsc: form.ifsc.toUpperCase() } : {}),
    };

    saveBank.mutate(payload);
  };

  const columns = [
    {
      key: 'name',
      header: 'Bank',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{row.code}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge tone={row.type === 'disbursement' ? 'info' : 'neutral'}>
          {row.type === 'disbursement' ? 'Disbursement' : 'Partner'}
        </Badge>
      ),
    },
    {
      key: 'accountNumberMasked',
      header: 'Account',
      hideBelow: 'md',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[13px]">{row.accountNumberMasked || '—'}</p>
          {row.ifsc ? <p className="mt-0.5 font-mono text-xs text-slate-500">{row.ifsc}</p> : null}
        </div>
      ),
    },
    { key: 'branch', header: 'Branch', hideBelow: 'lg', render: (row) => row.branch || '—' },
    {
      key: 'contactPerson',
      header: 'Contact',
      hideBelow: 'xl',
      render: (row) =>
        row.contactPerson ? (
          <div className="min-w-0">
            <p className="truncate">{row.contactPerson}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{row.contactEmail}</p>
          </div>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Added', hideBelow: 'xl', render: (row) => date(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            data-testid={actionId(TESTIDS.adminBanks.row, row._id, 'edit')}
            onClick={() => openEdit(row)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid={actionId(TESTIDS.adminBanks.row, row._id, 'delete')}
            onClick={() => setRemoving(row)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger-500 transition hover:bg-danger-50"
            aria-label={`Remove ${row.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminBanks.root}>
      <PageHeader
        title="Partner banks"
        subtitle="Disbursement accounts and partner banks used for loan payouts."
        actions={
          <Button icon={Plus} onClick={openCreate} data-testid={TESTIDS.adminBanks.addBank}>
            Add bank
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminBanks.table}
        testIdPrefix={TESTIDS.adminBanks.row}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by name, code or branch…"
        searchTestId={TESTIDS.adminBanks.searchInput}
        filters={[
          {
            label: 'Type',
            value: type,
            onChange: (value) => {
              setType(value);
              setPage(1);
            },
            options: [{ value: 'all', label: 'All types' }, ...BANK_TYPES],
            testId: TESTIDS.adminBanks.typeFilter,
          },
        ]}
        emptyIcon={Landmark}
        emptyTitle={search ? 'No matching banks' : 'No banks configured yet'}
        emptyMessage={
          search
            ? 'Try a different search term.'
            : 'Add a disbursement account so ops can release approved loans.'
        }
        emptyTestId={TESTIDS.adminBanks.empty}
        emptyAction={
          <Button className="mt-4" icon={Plus} onClick={openCreate} data-testid={TESTIDS.common.emptyStateAction}>
            Add bank
          </Button>
        }
        pagination={data?.meta}
        onPageChange={setPage}
      />

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? `Edit ${editing.name}` : 'Add a bank'}
        description="Disbursement accounts are the house accounts payouts are booked against."
        size="lg"
        testId={TESTIDS.adminBanks.modal}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              data-testid={TESTIDS.adminBanks.cancel}
            >
              Cancel
            </Button>
            <Button loading={saveBank.isPending} onClick={submit} data-testid={TESTIDS.adminBanks.submit}>
              {editing ? 'Save changes' : 'Add bank'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError ? <FormError message={formError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Bank name"
              name="name"
              placeholder="HDFC Bank"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              error={errors.name}
              testId={TESTIDS.adminBanks.nameInput}
              required
            />
            <Input
              label="Short code"
              name="code"
              placeholder="HDFC-PAYOUT"
              maxLength={20}
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              error={errors.code}
              hint="Unique identifier for this record."
              testId={TESTIDS.adminBanks.codeInput}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Type"
              name="type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={BANK_TYPES}
              testId={TESTIDS.adminBanks.typeSelect}
            />
            <Select
              label="Status"
              name="status"
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              testId={TESTIDS.adminBanks.statusSelect}
            />
          </div>

          <Input
            label="Account name"
            name="accountName"
            placeholder="SedBank Nodal Account"
            value={form.accountName}
            onChange={(event) => setForm({ ...form, accountName: event.target.value })}
            error={errors.accountName}
            testId={TESTIDS.adminBanks.accountNameInput}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Account number"
              name="accountNumber"
              inputMode="numeric"
              maxLength={18}
              placeholder={editing ? 'Leave blank to keep the current number' : '123456789012'}
              value={form.accountNumber}
              onChange={(event) =>
                setForm({ ...form, accountNumber: event.target.value.replace(/\D/g, '') })
              }
              error={errors.accountNumber}
              hint={editing ? 'Stored numbers are masked, so re-enter to change it.' : undefined}
              testId={TESTIDS.adminBanks.accountNumberInput}
            />
            <Input
              label="IFSC"
              name="ifsc"
              maxLength={11}
              placeholder="HDFC0001234"
              value={form.ifsc}
              onChange={(event) => setForm({ ...form, ifsc: event.target.value.toUpperCase() })}
              error={errors.ifsc}
              testId={TESTIDS.adminBanks.ifscInput}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Branch"
              name="branch"
              placeholder="Chennai — Anna Salai"
              value={form.branch}
              onChange={(event) => setForm({ ...form, branch: event.target.value })}
              error={errors.branch}
              testId={TESTIDS.adminBanks.branchInput}
            />
            <Input
              label="Contact person"
              name="contactPerson"
              value={form.contactPerson}
              onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
              error={errors.contactPerson}
            />
            <Input
              label="Contact email"
              name="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              error={errors.contactEmail}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        message="If this bank has been used for a disbursement it will be deactivated instead of deleted, so historic loans keep their reference."
        confirmLabel="Remove bank"
        loading={removeBank.isPending}
        onConfirm={() => removeBank.mutate(removing._id)}
      />
    </div>
  );
}
