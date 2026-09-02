/** Servicing view of one loan account: ledger, schedule and manual payment entry. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Download,
  Wallet,
  AlertTriangle,
  CalendarClock,
  TrendingDown,
  Phone,
} from 'lucide-react';
import { TESTIDS, rowId } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody, DataGrid, DataItem } from '../../components/ui/Card.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Tabs, TabPanel } from '../../components/ui/Tabs.jsx';
import { EmptyState, LoadingState, ErrorState, FormError } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { currency, date, dateTime, dueLabel, titleCase } from '../../lib/format.js';
import {
  PAYMENT_TYPES,
  PAYMENT_MODES,
  BUCKET_LABELS,
  ROLES,
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_OUTCOMES,
} from '../../lib/constants.js';
import { fieldErrorsOf } from '../../lib/utils.js';

export default function AdminLoanDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canRecordPayment = [ROLES.ADMIN, ROLES.OPS_OFFICER, ROLES.COLLECTIONS_OFFICER].includes(user.role);
  const canLogFollowUp = [ROLES.ADMIN, ROLES.COLLECTIONS_OFFICER].includes(user.role);

  const [tab, setTab] = useState('schedule');
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', type: 'emi', mode: 'neft', notes: '' });
  const [payErrors, setPayErrors] = useState({});
  const [payError, setPayError] = useState('');

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState({ activityType: 'call', outcome: 'promise_to_pay', notes: '', followUpDate: '' });
  const [noteError, setNoteError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loan', id],
    queryFn: () => http.get(`/loans/${id}`),
  });

  const { data: timelineData } = useQuery({
    queryKey: ['loan', id, 'timeline'],
    queryFn: () => http.get(`/loans/${id}/timeline`),
    enabled: !!data,
  });

  const { data: notesData } = useQuery({
    queryKey: ['collection-notes', id],
    queryFn: () => http.get(`/collections/${id}/notes`),
    enabled: !!data && canLogFollowUp,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['loan', id] });
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['collections'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const recordPayment = useMutation({
    mutationFn: (payload) => http.post('/payments/record', { loanId: id, ...payload }),
    onMutate: () => {
      setPayError('');
      setPayErrors({});
    },
    onSuccess: (result) => {
      setPayOpen(false);
      setPayForm({ amount: '', type: 'emi', mode: 'neft', notes: '' });
      invalidate();
      toast.success(
        result.closed ? 'Payment recorded — loan closed' : 'Payment recorded',
        `Receipt ${result.payment.paymentNo}.`
      );
    },
    onError: (err) => {
      setPayError(err.message);
      setPayErrors(fieldErrorsOf(err));
    },
  });

  const addNote = useMutation({
    mutationFn: (payload) => http.post(`/collections/${id}/notes`, payload),
    onMutate: () => setNoteError(''),
    onSuccess: () => {
      setNoteOpen(false);
      setNote({ activityType: 'call', outcome: 'promise_to_pay', notes: '', followUpDate: '' });
      queryClient.invalidateQueries({ queryKey: ['collection-notes', id] });
      toast.success('Follow-up logged');
    },
    onError: (err) => setNoteError(err.message),
  });

  const download = async (kind) => {
    const map = { schedule: 'schedule.pdf', statement: 'statement.pdf', noc: 'noc.pdf' };
    try {
      await http.download(`/loans/${id}/${map[kind]}`, `${data.loan.loanNo}-${kind}.pdf`);
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed', err.message);
    }
  };

  if (isLoading) return <LoadingState label="Loading the loan account…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { loan, schedule = [], payments = [], nextDue } = data;
  const isLive = ['active', 'overdue'].includes(loan.status);
  const isClosed = ['closed', 'foreclosed'].includes(loan.status);
  const notes = notesData?.notes ?? [];

  return (
    <div data-testid={TESTIDS.adminLoanDetail.root}>
      <PageHeader
        breadcrumb={
          <Link to="/admin/loans" className="hover:text-slate-700">
            Loan accounts
          </Link>
        }
        title={<span data-testid={TESTIDS.adminLoanDetail.number}>{loan.loanNo}</span>}
        subtitle={
          <span data-testid={TESTIDS.adminLoanDetail.borrower}>
            {loan.borrower?.name} · {loan.borrower?.mobile} · {loan.borrower?.email}
          </span>
        }
        actions={
          <>
            <StatusBadge status={loan.status} size="md" />
            {canLogFollowUp && loan.overdueAmount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Phone}
                onClick={() => setNoteOpen(true)}
                data-testid={TESTIDS.adminCollections.addNote}
              >
                Log follow-up
              </Button>
            ) : null}
            {canRecordPayment && isLive ? (
              <Button
                size="sm"
                icon={Banknote}
                onClick={() => {
                  setPayForm({
                    amount: nextDue ? String(nextDue.amountDue) : '',
                    type: 'emi',
                    mode: 'neft',
                    notes: '',
                  });
                  setPayOpen(true);
                }}
                data-testid={TESTIDS.adminLoanDetail.recordPayment}
              >
                Record payment
              </Button>
            ) : null}
          </>
        }
      />

      {loan.overdueAmount > 0 ? (
        <div className="mb-5 flex gap-3 rounded-card border border-danger-200 bg-danger-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" />
          <div>
            <p className="text-sm font-semibold text-danger-800">
              {currency(loan.overdueAmount, { decimals: 2 })} overdue · {loan.dpd} days past due ·{' '}
              {BUCKET_LABELS[loan.bucket]}
            </p>
            <p className="mt-0.5 text-xs text-danger-700">
              {loan.overdueEmiCount} installment{loan.overdueEmiCount === 1 ? '' : 's'} unpaid.
              Accrued late fees: {currency(loan.penaltyAccrued, { decimals: 2 })}.
            </p>
          </div>
        </div>
      ) : null}

      <StatGrid className="mb-5">
        <StatCard
          label="Principal outstanding"
          value={currency(loan.principalOutstanding)}
          hint={`${currency(loan.principalPaid)} repaid`}
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label="Total collected"
          value={currency(loan.totalPaid)}
          hint={`${currency(loan.interestPaid)} interest · ${currency(loan.penaltyPaid)} fees`}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="Next EMI due"
          value={nextDue ? currency(nextDue.amountDue, { decimals: 2 }) : '—'}
          hint={nextDue ? `${date(nextDue.dueDate)} · ${dueLabel(nextDue.dueDate)}` : 'Nothing outstanding'}
          icon={CalendarClock}
          tone={nextDue && nextDue.dpd > 0 ? 'danger' : 'warning'}
        />
        <StatCard
          label="Ageing"
          value={BUCKET_LABELS[loan.bucket]}
          hint={loan.dpd > 0 ? `${loan.dpd} days past due` : 'Account is current'}
          icon={TrendingDown}
          tone={loan.bucket === 'current' ? 'neutral' : loan.dpd > 60 ? 'danger' : 'warning'}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <Tabs
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: 'schedule', label: 'Schedule', count: schedule.length },
                { value: 'payments', label: 'Payments', count: payments.length },
                ...(canLogFollowUp ? [{ value: 'notes', label: 'Follow-ups', count: notes.length }] : []),
                { value: 'timeline', label: 'Audit trail' },
              ]}
            >
              <TabPanel value="schedule">
                <div className="table-scroll">
                  <table className="data-table" data-testid={TESTIDS.adminLoanDetail.scheduleTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="text-right">Due date</th>
                        <th className="text-right">Principal</th>
                        <th className="text-right">Interest</th>
                        <th className="text-right">EMI</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Late fee</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((emi) => (
                        <tr key={emi._id} data-testid={rowId('admin-loan-schedule', emi.installmentNo)}>
                          <td className="font-medium text-slate-900">{emi.installmentNo}</td>
                          <td className="text-right">{date(emi.dueDate)}</td>
                          <td className="text-right">{currency(emi.principal, { decimals: 2 })}</td>
                          <td className="text-right">{currency(emi.interest, { decimals: 2 })}</td>
                          <td className="text-right font-medium text-slate-900">
                            {currency(emi.totalAmount, { decimals: 2 })}
                          </td>
                          <td className="text-right">{currency(emi.amountPaid, { decimals: 2 })}</td>
                          <td className="text-right">
                            {emi.penalty > 0 ? (
                              <span className="text-danger-600">{currency(emi.penalty, { decimals: 2 })}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="text-right">
                            <StatusBadge status={emi.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabPanel>

              <TabPanel value="payments">
                {payments.length === 0 ? (
                  <EmptyState compact icon={Banknote} title="No payments recorded" />
                ) : (
                  <div className="table-scroll">
                    <table className="data-table" data-testid={TESTIDS.adminLoanDetail.paymentsTable}>
                      <thead>
                        <tr>
                          <th>Receipt</th>
                          <th>Date</th>
                          <th className="hidden sm:table-cell">Type</th>
                          <th className="hidden sm:table-cell">Mode</th>
                          <th className="hidden md:table-cell text-right">Principal</th>
                          <th className="hidden md:table-cell text-right">Interest</th>
                          <th className="hidden lg:table-cell text-right">Late fee</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment._id} data-testid={rowId('admin-loan-payments', payment._id)}>
                            <td className="font-mono text-[13px]">{payment.paymentNo}</td>
                            <td>{date(payment.paidAt)}</td>
                            <td className="hidden sm:table-cell">{titleCase(payment.type)}</td>
                            <td className="hidden sm:table-cell">{titleCase(payment.mode)}</td>
                            <td className="hidden md:table-cell text-right">
                              {currency(payment.principalComponent, { decimals: 2 })}
                            </td>
                            <td className="hidden md:table-cell text-right">
                              {currency(payment.interestComponent, { decimals: 2 })}
                            </td>
                            <td className="hidden lg:table-cell text-right">
                              {currency(payment.penaltyComponent, { decimals: 2 })}
                            </td>
                            <td className="text-right font-semibold text-success-700">
                              {currency(payment.amount, { decimals: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabPanel>

              {canLogFollowUp ? (
                <TabPanel value="notes">
                  {notes.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Phone}
                      title="No follow-ups logged"
                      message="Record calls, emails and visits against this borrower."
                    />
                  ) : (
                    <ul className="space-y-3" data-testid={TESTIDS.adminCollections.notesList}>
                      {notes.map((entry) => (
                        <li key={entry._id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge tone="neutral">{titleCase(entry.activityType)}</Badge>
                              <Badge tone={entry.outcome === 'promise_to_pay' ? 'success' : 'warning'}>
                                {titleCase(entry.outcome)}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-slate-400">{dateTime(entry.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{entry.notes}</p>
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            {entry.createdByName}
                            {entry.followUpDate ? ` · follow up on ${date(entry.followUpDate)}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabPanel>
              ) : null}

              <TabPanel value="timeline">
                {(timelineData?.timeline ?? []).length === 0 ? (
                  <EmptyState compact title="No activity recorded" />
                ) : (
                  <ol className="space-y-4">
                    {[...(timelineData?.timeline ?? [])].reverse().map((entry) => (
                      <li key={entry._id} className="flex gap-3">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800">{entry.description}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {dateTime(entry.timestamp)} · {entry.performedByName}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </TabPanel>
            </Tabs>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Account details" />
            <CardBody>
              <DataGrid columns={2}>
                <DataItem label="Application" value={loan.application?.applicationNo} mono />
                <DataItem label="Sanctioned" value={currency(loan.sanctionedAmount)} />
                <DataItem label="Net disbursed" value={currency(loan.disbursedAmount)} />
                <DataItem label="Processing fee" value={currency(loan.processingFee, { decimals: 2 })} />
                <DataItem label="Rate" value={`${loan.roi}% p.a.`} />
                <DataItem label="EMI" value={currency(loan.emiAmount, { decimals: 2 })} />
                <DataItem label="Tenure" value={`${loan.tenureMonths} months`} />
                <DataItem label="Disbursed on" value={date(loan.disbursedAt)} />
                <DataItem label="First EMI" value={date(loan.firstEmiDate)} />
                <DataItem label="Maturity" value={date(loan.maturityDate)} />
                <DataItem label="Payout bank" value={loan.disbursementBank?.name || 'Not specified'} />
                <DataItem label="Reference" value={loan.disbursementRef} mono />
                {isClosed ? (
                  <>
                    <DataItem label="Closed on" value={date(loan.closedAt)} />
                    <DataItem label="Reason" value={loan.closureReason} />
                  </>
                ) : null}
              </DataGrid>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            <CardBody className="space-y-2">
              <Button fullWidth variant="secondary" icon={Download} onClick={() => download('schedule')}>
                Repayment schedule (PDF)
              </Button>
              <Button fullWidth variant="secondary" icon={Download} onClick={() => download('statement')}>
                Account statement (PDF)
              </Button>
              {isClosed ? (
                <Button fullWidth variant="success" icon={Download} onClick={() => download('noc')}>
                  No-Dues Certificate
                </Button>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ---------------- Record payment ---------------- */}
      <Modal
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Record a payment"
        description="Use this for offline collections — branch, NEFT, cash or cheque."
        testId={TESTIDS.adminLoanDetail.paymentModal}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={recordPayment.isPending}
              disabled={!(Number(payForm.amount) > 0)}
              onClick={() =>
                recordPayment.mutate({
                  amount: Number(payForm.amount),
                  type: payForm.type,
                  mode: payForm.mode,
                  notes: payForm.notes,
                })
              }
              data-testid={TESTIDS.adminLoanDetail.paymentConfirm}
            >
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {payError ? <FormError message={payError} /> : null}

          {nextDue ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-600">
                Next due: installment #{nextDue.installmentNo} on {date(nextDue.dueDate)}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {currency(nextDue.amountDue, { decimals: 2 })}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Payment type"
              name="paymentType"
              value={payForm.type}
              onChange={(event) => setPayForm({ ...payForm, type: event.target.value })}
              options={PAYMENT_TYPES}
              testId={TESTIDS.adminLoanDetail.paymentTypeSelect}
            />
            <Select
              label="Mode"
              name="paymentMode"
              value={payForm.mode}
              onChange={(event) => setPayForm({ ...payForm, mode: event.target.value })}
              options={PAYMENT_MODES}
              testId={TESTIDS.adminLoanDetail.paymentModeSelect}
            />
          </div>

          <Input
            label="Amount"
            name="paymentAmount"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            prefix="₹"
            value={payForm.amount}
            onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })}
            error={payErrors.amount}
            hint={
              payForm.type === 'foreclosure'
                ? 'Must equal the full settlement amount for the loan to close.'
                : 'Applied penalty first, then interest, then principal — oldest installment first.'
            }
            testId={TESTIDS.adminLoanDetail.paymentAmountInput}
            required
          />

          <Textarea
            label="Notes (optional)"
            name="paymentNotes"
            rows={2}
            maxLength={500}
            placeholder="e.g. NEFT reference number, branch, collector name"
            value={payForm.notes}
            onChange={(event) => setPayForm({ ...payForm, notes: event.target.value })}
            testId={TESTIDS.adminLoanDetail.paymentNotesInput}
          />
        </div>
      </Modal>

      {/* ---------------- Follow-up note ---------------- */}
      <Modal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Log a collections follow-up"
        testId={TESTIDS.adminCollections.noteModal}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={addNote.isPending}
              disabled={note.notes.trim().length < 3}
              onClick={() =>
                addNote.mutate({
                  activityType: note.activityType,
                  outcome: note.outcome,
                  notes: note.notes.trim(),
                  ...(note.followUpDate ? { followUpDate: note.followUpDate } : {}),
                })
              }
              data-testid={TESTIDS.adminCollections.noteSubmit}
            >
              Save note
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {noteError ? <FormError message={noteError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Activity"
              name="activityType"
              value={note.activityType}
              onChange={(event) => setNote({ ...note, activityType: event.target.value })}
              options={COLLECTION_ACTIVITY_TYPES}
              testId={TESTIDS.adminCollections.noteTypeSelect}
            />
            <Select
              label="Outcome"
              name="outcome"
              value={note.outcome}
              onChange={(event) => setNote({ ...note, outcome: event.target.value })}
              options={COLLECTION_OUTCOMES}
              testId={TESTIDS.adminCollections.noteOutcomeSelect}
            />
          </div>

          <Textarea
            label="Notes"
            name="collectionNotes"
            rows={4}
            maxLength={2000}
            placeholder="What was discussed and what was agreed."
            value={note.notes}
            onChange={(event) => setNote({ ...note, notes: event.target.value })}
            testId={TESTIDS.adminCollections.noteTextInput}
            required
          />

          <Input
            label="Follow-up date (optional)"
            name="followUpDate"
            type="date"
            value={note.followUpDate}
            onChange={(event) => setNote({ ...note, followUpDate: event.target.value })}
            className="sm:max-w-xs"
            testId={TESTIDS.adminCollections.noteFollowUpInput}
          />
        </div>
      </Modal>
    </div>
  );
}
