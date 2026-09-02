/**
 * Admin user management — add, edit and deactivate internal users and customers.
 * Mirrors the "Add User" slide-over pattern used across the Sed* products.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, Pencil, UserX, Copy, Check } from 'lucide-react';
import { TESTIDS, actionId } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { FormError } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { date, timeAgo } from '../../lib/format.js';
import { ROLE_LABELS, ROLES } from '../../lib/constants.js';
import { debounce, fieldErrorsOf } from '../../lib/utils.js';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const EMPTY_FORM = {
  name: '',
  email: '',
  mobile: '',
  password: '',
  role: ROLES.CREDIT_OFFICER,
  status: 'active',
};

export default function AdminUsersPage() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [role, setRole] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const [deactivating, setDeactivating] = useState(null);

  useEffect(() => {
    const apply = debounce((value) => {
      setSearch(value);
      setPage(1);
    }, 350);
    apply(searchInput);
    return () => apply.cancel();
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', { page, role, search }],
    queryFn: () => http.list('/users', { params: { page, limit: 15, role, ...(search ? { search } : {}) } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const saveUser = useMutation({
    mutationFn: (payload) =>
      editing ? http.patch(`/users/${editing._id}`, payload) : http.post('/users', payload),
    onMutate: () => {
      setFormError('');
      setErrors({});
    },
    onSuccess: (result) => {
      invalidate();
      if (result.temporaryPassword) {
        // Shown once so the admin can pass the credential on.
        setTempPassword(result.temporaryPassword);
        toast.success('User created', 'Copy the temporary password before closing this dialog.');
      } else {
        setModalOpen(false);
        toast.success(editing ? 'User updated' : 'User created');
      }
    },
    onError: (err) => {
      setFormError(err.message);
      setErrors(fieldErrorsOf(err));
    },
  });

  const deactivate = useMutation({
    mutationFn: (id) => http.delete(`/users/${id}`),
    onSuccess: () => {
      setDeactivating(null);
      invalidate();
      toast.success('User deactivated', 'They can no longer sign in.');
    },
    onError: (err) => {
      setDeactivating(null);
      toast.error('Could not deactivate this user', err.message);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError('');
    setTempPassword('');
    setCopied(false);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name,
      email: row.email,
      mobile: row.mobile,
      password: '',
      role: row.role,
      status: row.status,
    });
    setErrors({});
    setFormError('');
    setTempPassword('');
    setModalOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();

    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter a name.';
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!/^[6-9]\d{9}$/.test(form.mobile)) next.mobile = 'Enter a valid 10-digit mobile number.';
    if (form.password && form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    if (Object.keys(next).length) return;

    if (editing) {
      const payload = {};
      if (form.name.trim() !== editing.name) payload.name = form.name.trim();
      if (form.mobile !== editing.mobile) payload.mobile = form.mobile;
      if (form.role !== editing.role) payload.role = form.role;
      if (form.status !== editing.status) payload.status = form.status;
      if (form.password) payload.password = form.password;

      if (!Object.keys(payload).length) {
        setModalOpen(false);
        toast.info('Nothing to update');
        return;
      }
      saveUser.mutate(payload);
    } else {
      saveUser.mutate({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile,
        role: form.role,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      });
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info('Copy the password manually', tempPassword);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            <span className="truncate">{row.name}</span>
            {row.isDemo ? <Badge tone="warning">Demo</Badge> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.email}</p>
        </div>
      ),
    },
    { key: 'mobile', header: 'Mobile', hideBelow: 'md', render: (row) => row.mobile },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge tone={row.role === 'customer' ? 'neutral' : 'info'}>{ROLE_LABELS[row.role]}</Badge>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      hideBelow: 'lg',
      render: (row) => (row.lastLoginAt ? timeAgo(row.lastLoginAt) : <span className="text-slate-400">Never</span>),
    },
    { key: 'createdAt', header: 'Added', hideBelow: 'xl', render: (row) => date(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            data-testid={actionId(TESTIDS.adminUsers.row, row._id, 'edit')}
            onClick={() => openEdit(row)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          {row.status === 'active' && row._id !== currentUser._id ? (
            <button
              type="button"
              data-testid={actionId(TESTIDS.adminUsers.row, row._id, 'deactivate')}
              onClick={() => setDeactivating(row)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger-500 transition hover:bg-danger-50"
              aria-label={`Deactivate ${row.name}`}
            >
              <UserX className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div data-testid={TESTIDS.adminUsers.root}>
      <PageHeader
        title="Users and roles"
        subtitle="Manage internal staff and customer accounts."
        actions={
          <Button icon={UserPlus} onClick={openCreate} data-testid={TESTIDS.adminUsers.addUser}>
            Add user
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        tableTestId={TESTIDS.adminUsers.table}
        testIdPrefix={TESTIDS.adminUsers.row}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by name, email or mobile…"
        searchTestId={TESTIDS.adminUsers.searchInput}
        filters={[
          {
            label: 'Role',
            value: role,
            onChange: (value) => {
              setRole(value);
              setPage(1);
            },
            options: [
              { value: 'all', label: 'All roles' },
              { value: 'staff', label: 'Internal staff' },
              ...ROLE_OPTIONS,
            ],
            testId: TESTIDS.adminUsers.roleFilter,
          },
        ]}
        emptyIcon={Users}
        emptyTitle={search ? 'No matching users' : 'No users yet'}
        emptyMessage={
          search ? 'Try a different search term.' : 'Add your first internal user to get started.'
        }
        emptyTestId={TESTIDS.adminUsers.empty}
        emptyAction={
          <Button className="mt-4" icon={UserPlus} onClick={openCreate} data-testid={TESTIDS.common.emptyStateAction}>
            Add user
          </Button>
        }
        pagination={data?.meta}
        onPageChange={setPage}
      />

      {/* ---------------- Add / edit dialog ---------------- */}
      <Modal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setTempPassword('');
        }}
        title={editing ? `Edit ${editing.name}` : 'Add a user'}
        description={
          editing
            ? 'Update this account. Leave the password blank to keep the current one.'
            : 'A temporary password is generated if you leave the password blank.'
        }
        testId={TESTIDS.adminUsers.modal}
        footer={
          tempPassword ? (
            <Button onClick={() => setModalOpen(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setModalOpen(false)}
                data-testid={TESTIDS.adminUsers.cancel}
              >
                Cancel
              </Button>
              <Button
                loading={saveUser.isPending}
                onClick={submit}
                data-testid={TESTIDS.adminUsers.submit}
              >
                {editing ? 'Save changes' : 'Create user'}
              </Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              The account was created. Share this temporary password — it is not shown again.
            </p>
            <div
              data-testid={TESTIDS.adminUsers.tempPassword}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <code className="break-all font-mono text-sm text-slate-900">{tempPassword}</code>
              <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copyPassword}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {formError ? <FormError message={formError} /> : null}

            <Input
              label="Full name"
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              error={errors.name}
              testId={TESTIDS.adminUsers.nameInput}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email address"
                name="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                error={errors.email}
                disabled={!!editing}
                hint={editing ? 'The sign-in email cannot be changed.' : undefined}
                testId={TESTIDS.adminUsers.emailInput}
                required
              />
              <Input
                label="Mobile number"
                name="mobile"
                inputMode="numeric"
                maxLength={10}
                prefix="+91"
                value={form.mobile}
                onChange={(event) =>
                  setForm({ ...form, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })
                }
                error={errors.mobile}
                testId={TESTIDS.adminUsers.mobileInput}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Role"
                name="role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
                options={ROLE_OPTIONS}
                error={errors.role}
                testId={TESTIDS.adminUsers.roleSelect}
                required
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
                error={errors.status}
                testId={TESTIDS.adminUsers.statusSelect}
              />
            </div>

            <Input
              label={editing ? 'New password (optional)' : 'Password (optional)'}
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              error={errors.password}
              hint="At least 8 characters with a letter, a number and a symbol."
              testId={TESTIDS.adminUsers.passwordInput}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate ${deactivating?.name}?`}
        message="They will be signed out and cannot sign in again until reactivated. Their history is preserved."
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivate.mutate(deactivating._id)}
      />
    </div>
  );
}
