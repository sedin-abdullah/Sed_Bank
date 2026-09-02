/**
 * Loan servicing screen for the borrower: balances, amortisation schedule,
 * payment ledger, self-serve payments (EMI / part-payment / foreclosure) and
 * PDF downloads including the No-Dues Certificate once the loan closes.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Download,
  FileCheck2,
  CalendarClock,
  Wallet,
  TrendingDown,
  AlertTriangle,
  Banknote,
  ShieldCheck,
} from 'lucide-react';
import { TESTIDS, rowId } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody, DataGrid, DataItem } from '../../components/ui/Card.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Tabs, TabPanel } from '../../components/ui/Tabs.jsx';
import { ProgressBar } from '../../components/ui/Stepper.jsx';
import { EmptyState, LoadingState, ErrorState, FormError } from '../../components/ui/States.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { currency, date, dateTime, dueLabel, titleCase } from '../../lib/format.js';
import { PAYMENT_TYPES } from '../../lib/constants.js';

const LIVE = ['active', 'overdue'];

export default function CustomerLoanDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('schedule');
  const [payOpen, setPayOpen] = useState(false);
  const [payType, setPayType] = useState('emi');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [foreclosureOpen, setForeclosureOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loan', id],
    queryFn: () => http.get(`/loans/${id}`),
  });

  const { data: timelineData } = useQuery({
    queryKey: ['loan', id, 'timeline'],
    queryFn: () => http.get(`/loans/${id}/timeline`),
    enabled: !!data,
  });

  // Only fetched when the borrower actually opens the foreclosure dialog.
  const { data: quoteData, isFetching: quoteLoading } = useQuery({
    queryKey: ['loan', id, 'foreclosure-quote'],
    queryFn: () => http.get(`/loans/${id}/foreclosure-quote`),
    enabled: foreclosureOpen,
    staleTime: 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['loan', id] });
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  /**
   * Self-serve payment: create a mock gateway order, then confirm it with the
   * signature the sandbox mints — the same two-step flow a real gateway uses.
   */
  const pay = useMutation({
    mutationFn: async ({ amount, type }) => {
      const { order } = await http.post('/payments/initiate', { loanId: id, amount, type });
      return http.post('/payments/confirm', {
        orderId: order.orderId,
        paymentId: order.sandboxCheckout.paymentId,
        signature: order.sandboxCheckout.signature,
        type,
      });
    },
    onMutate: () => setPayError(''),
    onSuccess: (result) => {
      setPayOpen(false);
      setForeclosureOpen(false);
      setPayAmount('');
      invalidate();

      if (result.closed) {
        toast.success('Loan closed', 'Your No-Dues Certificate is ready to download.');
      } else if (result.regeneration) {
        toast.success(
          'Part payment received',
          `Your EMI has been revised to ${currency(result.regeneration.newEmi, { decimals: 2 })}.`
        );
      } else {
        toast.success('Payment successful', `Receipt ${result.payment.paymentNo}.`);
      }
    },
    onError: (err) => {
      setPayError(err.message);
      toast.error('Payment failed', err.message);
    },
  });

  const download = async (kind) => {
    const names = {
      schedule: ['schedule.pdf', 'repayment-schedule'],
      statement: ['statement.pdf', 'statement'],
      noc: ['noc.pdf', 'no-dues-certificate'],
    };
    const [path, label] = names[kind];
    try {
      await http.download(`/loans/${id}/${path}`, `${data.loan.loanNo}-${label}.pdf`);
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed', err.message);
    }
  };

  const openPayModal = (type) => {
    setPayType(type);
    setPayError('');
    setPayAmount(
      type === 'emi' && data?.nextDue ? String(data.nextDue.amountDue) : ''
    );
    setPayOpen(true);
  };

  const scheduleColumns = useMemo(
    () => [
      { key: 'installmentNo', header: '#' },
      { key: 'dueDate', header: 'Due date' },
      { key: 'principal', header: 'Principal' },
      { key: 'interest', header: 'Interest' },
      { key: 'totalAmount', header: 'EMI' },
      { key: 'penalty', header: 'Late fee' },
      { key: 'status', header: 'Status' },
    ],
    []
  );

  if (isLoading) return <LoadingState label="Loading your loan…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { loan, schedule = [], payments = [], nextDue } = data;
  const isLive = LIVE.includes(loan.status);
  const isClosed = ['closed', 'foreclosed'].includes(loan.status);
  const paidCount = schedule.filter((emi) => ['paid', 'waived'].includes(emi.status)).length;
  const progress = loan.tenureMonths ? Math.round((paidCount / loan.tenureMonths) * 100) : 0;
  const quote = quoteData?.quote;

  return (
    <div data-testid={TESTIDS.loanDetail.root}>
      <PageHeader
        breadcrumb={
          <Link to="/app/loans" className="hover:text-slate-700">
            My loans
          </Link>
        }
        title={<span data-testid={TESTIDS.loanDetail.number}>{loan.loanNo}</span>}
        subtitle={`${currency(loan.sanctionedAmount)} at ${loan.roi}% p.a. over ${loan.tenureMonths} months`}
        actions={
          <>
            <StatusBadge status={loan.status} size="md" testId={TESTIDS.loanDetail.status} />
            {isLive ? (
              <Button
                icon={CreditCard}
                onClick={() => openPayModal('emi')}
                data-testid={TESTIDS.loanDetail.payNow}
              >
                Pay EMI
              </Button>
            ) : null}
          </>
        }
      />

      {loan.overdueAmount > 0 ? (
        <div className="mb-5 flex flex-col gap-3 rounded-card border border-danger-200 bg-danger-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" />
            <div>
              <p className="text-sm font-semibold text-danger-800">
                {currency(loan.overdueAmount, { decimals: 2 })} overdue across{' '}
                {loan.overdueEmiCount} installment{loan.overdueEmiCount === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-xs text-danger-700">
                {loan.dpd} days past due · bucket {loan.bucket}. Late fees of{' '}
                {currency(loan.penaltyAccrued - loan.penaltyPaid, { decimals: 2 })} are outstanding.
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => openPayModal('emi')}>
            Clear dues
          </Button>
        </div>
      ) : null}

      <StatGrid className="mb-5">
        <StatCard
          label="Principal outstanding"
          value={currency(loan.principalOutstanding)}
          hint={`${currency(loan.principalPaid)} repaid`}
          icon={Wallet}
          tone="brand"
          testId={TESTIDS.loanDetail.outstandingCard}
        />
        <StatCard
          label="Monthly EMI"
          value={currency(loan.emiAmount, { decimals: 2 })}
          hint={`${loan.roi}% p.a. reducing balance`}
          icon={TrendingDown}
          tone="neutral"
          testId={TESTIDS.loanDetail.emiCard}
        />
        <StatCard
          label="Next EMI due"
          value={nextDue ? currency(nextDue.amountDue, { decimals: 2 }) : '—'}
          hint={nextDue ? `${date(nextDue.dueDate)} · ${dueLabel(nextDue.dueDate)}` : 'Nothing outstanding'}
          icon={CalendarClock}
          tone={nextDue && nextDue.dpd > 0 ? 'danger' : 'warning'}
          testId={TESTIDS.loanDetail.nextDueCard}
        />
        <StatCard
          label="Total paid"
          value={currency(loan.totalPaid)}
          hint={`${paidCount} of ${loan.tenureMonths} installments`}
          icon={Banknote}
          tone="success"
          testId={TESTIDS.loanDetail.overdueCard}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardBody>
              <ProgressBar
                value={progress}
                label={`${paidCount} of ${loan.tenureMonths} installments settled`}
                tone={loan.status === 'overdue' ? 'danger' : isClosed ? 'success' : 'brand'}
                testId={TESTIDS.loanDetail.progress}
              />

              <Tabs
                className="mt-5"
                value={tab}
                onValueChange={setTab}
                tabs={[
                  {
                    value: 'schedule',
                    label: 'Repayment schedule',
                    testId: TESTIDS.loanDetail.tabSchedule,
                    count: schedule.length,
                  },
                  {
                    value: 'payments',
                    label: 'Payments',
                    testId: TESTIDS.loanDetail.tabPayments,
                    count: payments.length,
                  },
                  {
                    value: 'timeline',
                    label: 'Activity',
                    testId: TESTIDS.loanDetail.tabTimeline,
                  },
                ]}
              >
                <TabPanel value="schedule">
                  <div className="table-scroll">
                    <table className="data-table" data-testid={TESTIDS.loanDetail.scheduleTable}>
                      <thead>
                        <tr>
                          {scheduleColumns.map((column) => (
                            <th
                              key={column.key}
                              className={column.key === 'installmentNo' ? '' : 'text-right'}
                            >
                              {column.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((emi) => (
                          <tr
                            key={emi._id}
                            data-testid={rowId(TESTIDS.loanDetail.scheduleRow, emi.installmentNo)}
                          >
                            <td className="font-medium text-slate-900">{emi.installmentNo}</td>
                            <td className="text-right">{date(emi.dueDate)}</td>
                            <td className="text-right">{currency(emi.principal, { decimals: 2 })}</td>
                            <td className="text-right">{currency(emi.interest, { decimals: 2 })}</td>
                            <td className="text-right font-medium text-slate-900">
                              {currency(emi.totalAmount, { decimals: 2 })}
                            </td>
                            <td className="text-right">
                              {emi.penalty > 0 ? (
                                <span className="text-danger-600">
                                  {currency(emi.penalty, { decimals: 2 })}
                                </span>
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
                    <EmptyState
                      compact
                      icon={CreditCard}
                      title="No payments recorded yet"
                      message="Your payment receipts will appear here."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table" data-testid={TESTIDS.loanDetail.paymentsTable}>
                        <thead>
                          <tr>
                            <th>Receipt</th>
                            <th>Date</th>
                            <th className="hidden sm:table-cell">Type</th>
                            <th className="hidden md:table-cell text-right">Principal</th>
                            <th className="hidden md:table-cell text-right">Interest</th>
                            <th className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => (
                            <tr
                              key={payment._id}
                              data-testid={rowId(TESTIDS.loanDetail.paymentRow, payment._id)}
                            >
                              <td className="font-mono text-[13px]">{payment.paymentNo}</td>
                              <td>{date(payment.paidAt)}</td>
                              <td className="hidden sm:table-cell">{titleCase(payment.type)}</td>
                              <td className="hidden md:table-cell text-right">
                                {currency(payment.principalComponent, { decimals: 2 })}
                              </td>
                              <td className="hidden md:table-cell text-right">
                                {currency(payment.interestComponent, { decimals: 2 })}
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

                <TabPanel value="timeline">
                  {(timelineData?.timeline ?? []).length === 0 ? (
                    <EmptyState compact title="No activity yet" />
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
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Loan details" />
            <CardBody>
              <DataGrid columns={2}>
                <DataItem label="Sanctioned" value={currency(loan.sanctionedAmount)} />
                <DataItem label="Disbursed" value={currency(loan.disbursedAmount)} />
                <DataItem label="Processing fee" value={currency(loan.processingFee, { decimals: 2 })} />
                <DataItem label="Interest rate" value={`${loan.roi}% p.a.`} />
                <DataItem label="Disbursed on" value={date(loan.disbursedAt)} />
                <DataItem label="Maturity" value={date(loan.maturityDate)} />
                <DataItem label="Interest paid" value={currency(loan.interestPaid, { decimals: 2 })} />
                <DataItem label="Late fees paid" value={currency(loan.penaltyPaid, { decimals: 2 })} />
                {isClosed ? (
                  <DataItem label="Closed on" value={date(loan.closedAt)} className="sm:col-span-2" />
                ) : null}
              </DataGrid>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardBody className="space-y-2">
              {isLive ? (
                <>
                  {/* The page header already owns `payNow`; a testid must be unique. */}
                  <Button fullWidth icon={CreditCard} onClick={() => openPayModal('emi')}>
                    Pay EMI
                  </Button>
                  <Button
                    fullWidth
                    variant="secondary"
                    icon={TrendingDown}
                    onClick={() => openPayModal('part_payment')}
                    data-testid={TESTIDS.loanDetail.partPayment}
                  >
                    Make a part payment
                  </Button>
                  <Button
                    fullWidth
                    variant="secondary"
                    icon={ShieldCheck}
                    onClick={() => setForeclosureOpen(true)}
                    data-testid={TESTIDS.loanDetail.foreclose}
                  >
                    Foreclose this loan
                  </Button>
                  <div className="my-1 border-t border-slate-100" />
                </>
              ) : null}

              <Button
                fullWidth
                variant="secondary"
                icon={Download}
                onClick={() => download('schedule')}
                data-testid={TESTIDS.loanDetail.downloadSchedule}
              >
                Repayment schedule (PDF)
              </Button>
              <Button
                fullWidth
                variant="secondary"
                icon={Download}
                onClick={() => download('statement')}
                data-testid={TESTIDS.loanDetail.downloadStatement}
              >
                Account statement (PDF)
              </Button>

              {isClosed ? (
                <Button
                  fullWidth
                  variant="success"
                  icon={FileCheck2}
                  onClick={() => download('noc')}
                  data-testid={TESTIDS.loanDetail.downloadNoc}
                >
                  No-Dues Certificate
                </Button>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ---------------- Payment dialog ---------------- */}
      <Modal
        open={payOpen}
        onOpenChange={setPayOpen}
        title={payType === 'part_payment' ? 'Make a part payment' : 'Pay your EMI'}
        description={
          payType === 'part_payment'
            ? 'Anything above your current dues reduces the principal, and your future EMIs are recalculated.'
            : 'Payment is processed through a simulated gateway — no real money moves.'
        }
        testId={TESTIDS.loanDetail.payModal}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPayOpen(false)}
              data-testid={TESTIDS.loanDetail.payCancel}
            >
              Cancel
            </Button>
            <Button
              loading={pay.isPending}
              disabled={!(Number(payAmount) > 0)}
              onClick={() => pay.mutate({ amount: Number(payAmount), type: payType })}
              data-testid={TESTIDS.loanDetail.payConfirm}
            >
              Pay {payAmount ? currency(Number(payAmount), { decimals: 2 }) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {payError ? <FormError message={payError} /> : null}

          {nextDue ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-600">
                Installment #{nextDue.installmentNo} · due {date(nextDue.dueDate)}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {currency(nextDue.amountDue, { decimals: 2 })}
              </p>
              {nextDue.penalty > 0 ? (
                <p className="mt-0.5 text-xs text-danger-600">
                  Includes {currency(nextDue.penalty, { decimals: 2 })} late fee
                </p>
              ) : null}
            </div>
          ) : null}

          <Select
            label="Payment type"
            name="payType"
            value={payType}
            onChange={(event) => setPayType(event.target.value)}
            options={PAYMENT_TYPES.filter((option) => option.value !== 'foreclosure')}
            testId={TESTIDS.loanDetail.payTypeSelect}
          />

          <Input
            label="Amount"
            name="payAmount"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            prefix="₹"
            value={payAmount}
            onChange={(event) => setPayAmount(event.target.value)}
            hint={
              payType === 'emi'
                ? 'Applied to your oldest unpaid installment first.'
                : 'Dues are cleared first; the rest reduces your principal.'
            }
            testId={TESTIDS.loanDetail.payAmountInput}
            required
          />
        </div>
      </Modal>

      {/* ---------------- Foreclosure dialog ---------------- */}
      <Modal
        open={foreclosureOpen}
        onOpenChange={setForeclosureOpen}
        title="Foreclose this loan"
        description="Settle the loan in full today. Future interest is waived."
        testId={TESTIDS.loanDetail.foreclosureModal}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForeclosureOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pay.isPending}
              disabled={!quote}
              onClick={() => pay.mutate({ amount: quote.totalPayable, type: 'foreclosure' })}
              data-testid={TESTIDS.loanDetail.foreclosureConfirm}
            >
              Pay and close
            </Button>
          </>
        }
      >
        {quoteLoading || !quote ? (
          <LoadingState compact label="Calculating your settlement amount…" />
        ) : (
          <div className="space-y-4">
            {payError ? <FormError message={payError} /> : null}

            <div className="rounded-card border border-white/10 bg-brand-gradient p-4 text-white shadow-glow-brand">
              <p className="text-xs uppercase tracking-wide text-slate-400">Settlement amount</p>
              <p
                data-testid={TESTIDS.loanDetail.foreclosureTotal}
                className="mt-1 text-2xl font-semibold"
              >
                {currency(quote.totalPayable, { decimals: 2 })}
              </p>
              {quote.interestSaved > 0 ? (
                <p className="mt-1 text-xs text-success-500">
                  You save {currency(quote.interestSaved, { decimals: 2 })} in future interest.
                </p>
              ) : null}
            </div>

            <DataGrid columns={2}>
              <DataItem label="Principal outstanding" value={currency(quote.principalOutstanding, { decimals: 2 })} />
              <DataItem label="Accrued interest" value={currency(quote.accruedInterest, { decimals: 2 })} />
              <DataItem label="Outstanding late fees" value={currency(quote.outstandingPenalty, { decimals: 2 })} />
              <DataItem
                label={`Foreclosure charge (${quote.foreclosureChargePct}%)`}
                value={currency(quote.foreclosureCharge, { decimals: 2 })}
              />
            </DataGrid>

            <p className="text-xs text-slate-500">
              This quote is valid until end of day. Once settled, your No-Dues Certificate becomes
              available to download.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
