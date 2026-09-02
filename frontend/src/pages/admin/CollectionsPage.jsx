/**
 * Collections desk: ageing overview, delinquent worklist, bulk reminders and
 * per-borrower follow-up notes.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CheckCircle2, Send, Phone, AlertTriangle, Wallet, Users } from 'lucide-react';
import { TESTIDS, rowId, bucketCardId } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select, Textarea } from '../../components/ui/Field.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { EmptyState, LoadingState, ErrorState, TableSkeleton, FormError } from '../../components/ui/States.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { currency, currencyCompact, date, number, timeAgo } from '../../lib/format.js';
import { BUCKET_LABELS, DELINQUENCY_BUCKETS } from '../../lib/constants.js';
import { LifecycleFlow } from '../../components/ui/LifecycleFlow.jsx';
import { cn } from '../../lib/utils.js';
import {
  AGEING_COLORS,
  GRID_PROPS,
  AXIS_PROPS,
  TOOLTIP_STYLE,
} from '../../lib/chartTheme.js';

const BUCKET_COLORS = AGEING_COLORS;

export default function AdminCollectionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [bucket, setBucket] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [remindOpen, setRemindOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [remindError, setRemindError] = useState('');

  const overview = useQuery({
    queryKey: ['collections', 'overview'],
    queryFn: () => http.get('/collections/overview'),
  });

  const accounts = useQuery({
    queryKey: ['collections', 'accounts', { bucket, page }],
    queryFn: () => http.list('/collections/accounts', { params: { bucket, page, limit: 15 } }),
  });

  const sendReminders = useMutation({
    mutationFn: () => http.post('/collections/remind', { loanIds: selected, message: message.trim() }),
    onMutate: () => setRemindError(''),
    onSuccess: (result) => {
      setRemindOpen(false);
      setSelected([]);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success(
        `${result.sent} reminder${result.sent === 1 ? '' : 's'} sent`,
        'Delivered over the simulated email and SMS channels.'
      );
    },
    onError: (err) => setRemindError(err.message),
  });

  const rows = accounts.data?.items ?? [];
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row._id));
  const toggleOne = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  if (overview.isLoading) return <LoadingState label="Loading the collections book…" />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.refetch} />;

  const { buckets, totals } = overview.data;
  const delinquentBuckets = buckets.filter((row) => row.bucket !== 'current');
  const hasDelinquency = totals.delinquentAccounts > 0;

  /**
   * The ageing ladder, rendered with the same connected-node language the
   * other dashboards use. Counts and amounts are the real bucket rows; a
   * bucket with accounts in it reads as "blocked" so severity is visible.
   */
  const ageingStages = buckets.map((row) => ({
    key: row.bucket,
    label: row.label ?? BUCKET_LABELS[row.bucket] ?? row.bucket,
    value: number(row.accounts),
    // NB: this endpoint calls the field `overdueAmount`; the dashboard
    // endpoint calls the equivalent field `amount`.
    hint: row.overdueAmount > 0 ? currency(row.overdueAmount) : 'nothing due',
    tone: row.bucket === 'current' ? 'done' : row.accounts > 0 ? 'blocked' : 'upcoming',
    detail:
      row.bucket === 'current'
        ? `${number(row.accounts)} account(s) up to date, with nothing past due.`
        : `${number(row.accounts)} account(s) ${row.label ?? row.bucket} past due, totalling ${currency(row.overdueAmount)} in principal, interest and late fees.`,
  }));

  // Sit the pipeline at the worst bucket that actually has accounts in it.
  const worstIndex = buckets.reduce(
    (worst, row, index) => (row.accounts > 0 ? index : worst),
    0
  );

  return (
    <div data-testid={TESTIDS.adminCollections.root}>
      <PageHeader
        title="Collections"
        subtitle="Overdue accounts by ageing bucket, with follow-up logging and bulk reminders."
        actions={
          selected.length > 0 ? (
            <Button
              icon={Send}
              onClick={() => setRemindOpen(true)}
              data-testid={TESTIDS.adminCollections.sendReminders}
            >
              Send reminder ({selected.length})
            </Button>
          ) : null
        }
      />

      {/* ---------------- Ageing ladder, as connected nodes ---------------- */}
      <LifecycleFlow
        stages={ageingStages}
        currentIndex={worstIndex}
        title="Delinquency ageing"
        subtitle="Select a bucket for detail"
        testId={TESTIDS.adminCollections.lifecycle}
        className="mb-4"
      />

      <StatGrid className="mb-4" data-testid={TESTIDS.adminCollections.overview}>
        <StatCard
          label="Delinquent accounts"
          value={number(totals.delinquentAccounts)}
          hint={`${number(totals.currentAccounts)} accounts current`}
          icon={AlertTriangle}
          tone={hasDelinquency ? 'danger' : 'success'}
          featured
          valueTestId={TESTIDS.adminCollections.delinquentCount}
        />
        <StatCard
          label="Total overdue"
          value={currencyCompact(totals.totalOverdue)}
          hint="Principal, interest and late fees"
          icon={Wallet}
          tone="danger"
          valueTestId={TESTIDS.adminCollections.totalOverdue}
        />
        <StatCard
          label="Portfolio outstanding"
          value={currencyCompact(totals.portfolioOutstanding)}
          hint="Across all live loans"
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label="Worst bucket"
          value={
            delinquentBuckets.filter((row) => row.accounts > 0).slice(-1)[0]?.label ?? 'None'
          }
          hint={hasDelinquency ? 'Oldest ageing band in use' : 'Nothing past due'}
          icon={Users}
          tone={hasDelinquency ? 'warning' : 'neutral'}
        />
      </StatGrid>

      {/* ---------------- Bucket cards + chart ---------------- */}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" testId={TESTIDS.adminCollections.bucketChart}>
          <CardHeader title="Ageing distribution" subtitle="Accounts and amount by days past due" />
          <CardBody>
            {!hasDelinquency ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Nothing overdue"
                message="Every live loan account is current. Overdue accounts appear here as EMIs age past their due date."
              />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={delinquentBuckets} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" {...AXIS_PROPS} />
                    <YAxis
                      allowDecimals={false}
                      {...AXIS_PROPS}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, name) => (name === 'accounts' ? value : currency(value))}
                    />
                    <Bar dataKey="accounts" name="accounts" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {delinquentBuckets.map((row) => (
                        <Cell key={row.bucket} fill={BUCKET_COLORS[row.bucket]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {delinquentBuckets.map((row) => (
            <button
              key={row.bucket}
              type="button"
              data-testid={bucketCardId(row.bucket)}
              onClick={() => {
                setBucket(row.bucket);
                setPage(1);
                setSelected([]);
              }}
              className={cn(
                'card p-3.5 text-left transition',
                bucket === row.bucket ? 'border-brand-400 ring-1 ring-brand-300' : 'hover:border-brand-300'
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {row.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{row.accounts}</p>
              <p className="mt-0.5 text-xs text-slate-500">{currency(row.overdueAmount)} overdue</p>
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- Worklist ---------------- */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <Select
            value={bucket}
            onChange={(event) => {
              setBucket(event.target.value);
              setPage(1);
              setSelected([]);
            }}
            options={[
              { value: 'all', label: 'All delinquent accounts' },
              ...DELINQUENCY_BUCKETS.filter((key) => key !== 'current').map((key) => ({
                value: key,
                label: BUCKET_LABELS[key],
              })),
            ]}
            aria-label="Ageing bucket"
            className="sm:w-64"
            testId={TESTIDS.adminCollections.bucketFilter}
          />

          {rows.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {selected.length > 0 ? `${selected.length} selected` : `${rows.length} accounts`}
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={Send}
                disabled={selected.length === 0}
                onClick={() => setRemindOpen(true)}
              >
                Send reminder
              </Button>
            </div>
          ) : null}
        </div>

        {accounts.isLoading ? (
          <TableSkeleton columns={6} />
        ) : accounts.error ? (
          <ErrorState error={accounts.error} onRetry={accounts.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No overdue accounts"
            message={
              bucket === 'all'
                ? 'Every live loan is current. Nothing needs chasing right now.'
                : `No accounts are sitting in the ${BUCKET_LABELS[bucket]} bucket.`
            }
            testId={TESTIDS.adminCollections.empty}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table" data-testid={TESTIDS.adminCollections.table}>
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      data-testid={TESTIDS.adminCollections.selectAll}
                      aria-label="Select all accounts"
                      className="h-4 w-4 rounded border-white/20 text-brand-500 focus:ring-brand-500"
                    />
                  </th>
                  <th>Loan</th>
                  <th className="hidden sm:table-cell">Borrower</th>
                  <th className="text-right">Overdue</th>
                  <th className="hidden md:table-cell text-right">DPD</th>
                  <th className="hidden lg:table-cell">Oldest due</th>
                  <th className="hidden lg:table-cell">Last contact</th>
                  <th className="text-right">Bucket</th>
                  <th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} data-testid={rowId(TESTIDS.adminCollections.row, row._id)}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row._id)}
                        onChange={() => toggleOne(row._id)}
                        aria-label={`Select ${row.loanNo}`}
                        className="h-4 w-4 rounded border-white/20 text-brand-500 focus:ring-brand-500"
                      />
                    </td>
                    <td>
                      <p className="font-mono text-[13px] font-medium text-slate-900">{row.loanNo}</p>
                      <p className="mt-0.5 text-xs text-slate-500 sm:hidden">{row.borrower?.name}</p>
                    </td>
                    <td className="hidden sm:table-cell">
                      <p className="truncate font-medium text-slate-900">{row.borrower?.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{row.borrower?.mobile}</p>
                    </td>
                    <td className="text-right font-semibold text-danger-600">
                      {currency(row.overdueAmount, { decimals: 2 })}
                      <p className="mt-0.5 text-xs font-normal text-slate-500">
                        {row.overdueEmiCount} EMI{row.overdueEmiCount === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="hidden md:table-cell text-right">{row.dpd}</td>
                    <td className="hidden lg:table-cell">
                      {row.oldestOverdue ? date(row.oldestOverdue.dueDate) : '—'}
                    </td>
                    <td className="hidden lg:table-cell">
                      {row.lastContactedAt ? (
                        <span className="text-xs">{timeAgo(row.lastContactedAt)}</span>
                      ) : (
                        <span className="text-xs text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Badge tone={row.dpd > 60 ? 'danger' : 'warning'}>
                        {BUCKET_LABELS[row.bucket]}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Phone}
                        onClick={() => navigate(`/admin/loans/${row._id}`)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- Bulk reminder ---------------- */}
      <Modal
        open={remindOpen}
        onOpenChange={setRemindOpen}
        title={`Send a payment reminder to ${selected.length} borrower${selected.length === 1 ? '' : 's'}`}
        description="Delivered over the simulated email and SMS channels, and logged in each account's audit trail."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemindOpen(false)}>
              Cancel
            </Button>
            <Button loading={sendReminders.isPending} onClick={() => sendReminders.mutate()}>
              Send {selected.length} reminder{selected.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {remindError ? <FormError message={remindError} /> : null}

          <Textarea
            label="Message (optional)"
            name="reminderMessage"
            rows={4}
            maxLength={500}
            placeholder="Leave blank to send the standard reminder with each borrower's overdue amount and days past due."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            hint="A blank message sends a personalised default per account."
          />
        </div>
      </Modal>
    </div>
  );
}
