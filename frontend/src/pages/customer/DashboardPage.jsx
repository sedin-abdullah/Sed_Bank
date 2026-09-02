/**
 * Customer dashboard: current application (with stepper), active loan summary,
 * next EMI, recent transactions and quick actions.
 *
 * Every figure is served live by /dashboard/customer — there are no placeholder
 * numbers, so a new account correctly shows an empty state instead of zeros
 * dressed up as data.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  CalendarClock,
  TrendingUp,
  FileText,
  Plus,
  CreditCard,
  Download,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Card, CardHeader, CardBody, DataGrid, DataItem } from '../../components/ui/Card.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { LifecycleFlow } from '../../components/ui/LifecycleFlow.jsx';
import { RadialGauge } from '../../components/ui/RadialGauge.jsx';
import { EmptyState, LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { currency, date, dueLabel, titleCase } from '../../lib/format.js';
import { CHART_TOKENS } from '../../lib/chartTheme.js';
import { APPLICATION_STATUS, APPLICATION_STAGES, STAGE_DETAIL } from '../../lib/constants.js';

const TERMINAL = [
  APPLICATION_STATUS.DISBURSED,
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.CANCELLED,
];

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'customer'],
    queryFn: () => http.get('/dashboard/customer'),
  });

  if (isLoading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { kpis, currentApplication, activeLoan, nextDue, recentPayments = [] } = data;
  const hasAnything = kpis.openApplications > 0 || kpis.activeLoans > 0 || data.applications?.length;

  /**
   * The borrower's journey as connected nodes. The stage list is the app's
   * canonical `APPLICATION_STAGES`, and the position comes from the
   * application's own `stage` — no invented steps.
   */
  const journeyIndex = currentApplication
    ? Math.max(
        0,
        APPLICATION_STAGES.findIndex((stage) => stage.key === currentApplication.stage)
      )
    : 0;
  const isRejected = currentApplication?.status === APPLICATION_STATUS.REJECTED;
  const journeyStages = APPLICATION_STAGES.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    detail: STAGE_DETAIL[stage.key],
    // A rejected application stops dead at the stage it reached.
    tone: isRejected && index === journeyIndex ? 'blocked' : undefined,
  }));

  const downloadStatement = async () => {
    if (!activeLoan) return;
    try {
      await http.download(`/loans/${activeLoan._id}/statement.pdf`, `${activeLoan.loanNo}-statement.pdf`);
      toast.success('Statement downloaded');
    } catch (err) {
      toast.error('Download failed', err.message);
    }
  };

  return (
    <div data-testid={TESTIDS.customerDashboard.root}>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle="Track your application, loans and upcoming payments."
        actions={
          <Button
            icon={Plus}
            onClick={() => navigate('/app/apply')}
            data-testid={TESTIDS.customerDashboard.quickApply}
          >
            Apply for a loan
          </Button>
        }
      />

      {/* First-run state: nothing to show yet, so point at the first action. */}
      {!hasAnything ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No applications yet"
            message="Check what you qualify for, then apply for your first personal loan. It takes a few minutes and the decision is usually instant."
            testId={TESTIDS.customerDashboard.empty}
            action={
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  icon={ArrowRight}
                  iconRight
                  onClick={() => navigate('/app/apply')}
                  data-testid={TESTIDS.common.emptyStateAction}
                >
                  Apply for your first loan
                </Button>
                <Button variant="secondary" onClick={() => navigate('/app/eligibility')}>
                  Check eligibility first
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <StatGrid className="mb-5">
            <StatCard
              label="Active loans"
              value={kpis.activeLoans}
              hint={kpis.activeLoans ? `${currency(kpis.totalOutstanding)} outstanding` : 'None right now'}
              icon={Wallet}
              tone="brand"
              testId={TESTIDS.customerDashboard.activeLoanCard}
            />
            <StatCard
              label="Next EMI due"
              value={nextDue ? currency(nextDue.amountDue, { decimals: 2 }) : '—'}
              hint={nextDue ? dueLabel(nextDue.dueDate) : 'Nothing scheduled'}
              icon={CalendarClock}
              tone={nextDue && nextDue.dpd > 0 ? 'danger' : 'warning'}
              testId={TESTIDS.customerDashboard.nextEmiCard}
            />
            <StatCard
              label="Total repaid"
              value={currency(kpis.totalRepaid)}
              hint={`${currency(kpis.totalBorrowed)} borrowed to date`}
              icon={TrendingUp}
              tone="success"
              testId={TESTIDS.customerDashboard.totalRepaidCard}
            />
            <StatCard
              label="Application status"
              value={currentApplication ? titleCase(currentApplication.status) : 'None open'}
              hint={currentApplication ? currentApplication.applicationNo : 'Apply to get started'}
              icon={FileText}
              tone="neutral"
              testId={TESTIDS.customerDashboard.applicationStatusCard}
            />
          </StatGrid>

          {kpis.overdueAmount > 0 ? (
            <div className="mb-5 flex flex-col gap-3 rounded-card border border-danger-200 bg-danger-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" />
                <div>
                  <p className="text-sm font-semibold text-danger-800">
                    {currency(kpis.overdueAmount, { decimals: 2 })} is overdue
                  </p>
                  <p className="mt-0.5 text-xs text-danger-700">
                    Late fees continue to accrue until the outstanding EMIs are cleared.
                  </p>
                </div>
              </div>
              {activeLoan ? (
                <Button variant="danger" size="sm" onClick={() => navigate(`/app/loans/${activeLoan._id}`)}>
                  Pay now
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {/* Application progress */}
              {currentApplication && !TERMINAL.includes(currentApplication.status) ? (
                <Card>
                  <CardHeader
                    title="Your application"
                    subtitle={currentApplication.applicationNo}
                    actions={
                      <>
                        <StatusBadge status={currentApplication.status} />
                        <Button
                          size="sm"
                          icon={ArrowRight}
                          iconRight
                          onClick={() => navigate(`/app/applications/${currentApplication._id}`)}
                          data-testid={TESTIDS.customerDashboard.continueApplication}
                        >
                          Continue
                        </Button>
                      </>
                    }
                  />
                  <CardBody>
                    <LifecycleFlow
                      stages={journeyStages}
                      currentIndex={journeyIndex}
                      testId={TESTIDS.customerDashboard.lifecycle}
                      surface={false}
                    />
                    <DataGrid className="mt-6" columns={3}>
                      <DataItem label="Amount requested" value={currency(currentApplication.amountRequested)} />
                      <DataItem label="Tenure" value={`${currentApplication.tenureRequested} months`} />
                      <DataItem label="Purpose" value={titleCase(currentApplication.purpose)} />
                    </DataGrid>
                  </CardBody>
                </Card>
              ) : null}

              {/* Active loan */}
              {activeLoan ? (
                <Card>
                  <CardHeader
                    title="Active loan"
                    subtitle={activeLoan.loanNo}
                    actions={
                      <>
                        <StatusBadge status={activeLoan.status} />
                        <Link to={`/app/loans/${activeLoan._id}`}>
                          <Button size="sm" variant="secondary">
                            Manage
                          </Button>
                        </Link>
                      </>
                    }
                  />
                  <CardBody>
                    <DataGrid columns={4}>
                      <DataItem label="Sanctioned" value={currency(activeLoan.sanctionedAmount)} />
                      <DataItem label="Outstanding" value={currency(activeLoan.principalOutstanding)} />
                      <DataItem label="Monthly EMI" value={currency(activeLoan.emiAmount, { decimals: 2 })} />
                      <DataItem label="Interest rate" value={`${activeLoan.roi}% p.a.`} />
                    </DataGrid>

                    <RadialGauge
                      className="mt-6"
                      testId={TESTIDS.customerDashboard.repaymentGauge}
                      segments={[
                        {
                          key: 'paid',
                          label: 'Installments paid',
                          value: activeLoan.paidInstallments,
                          color: CHART_TOKENS.roseLight,
                        },
                        {
                          key: 'remaining',
                          label: 'Installments remaining',
                          value: Math.max(0, activeLoan.tenureMonths - activeLoan.paidInstallments),
                          color: 'rgba(255,255,255,0.12)',
                        },
                      ]}
                      value={currency(activeLoan.principalOutstanding ?? 0)}
                      caption="Principal outstanding"
                      percent={`${Math.round(activeLoan.progressPct)}%`}
                      percentLabel="Repaid"
                      pill={
                        activeLoan.status === 'overdue'
                          ? { label: 'Payment overdue', tone: 'danger' }
                          : { label: 'On track', tone: 'success' }
                      }
                      footnote={`${activeLoan.paidInstallments} of ${activeLoan.tenureMonths} installments paid`}
                    />

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={CreditCard}
                        onClick={() => navigate(`/app/loans/${activeLoan._id}`)}
                        data-testid={TESTIDS.customerDashboard.quickPay}
                      >
                        Make a payment
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        onClick={downloadStatement}
                        data-testid={TESTIDS.customerDashboard.quickStatement}
                      >
                        Download statement
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </div>

            {/* Recent transactions */}
            <Card testId={TESTIDS.customerDashboard.recentPayments}>
              <CardHeader
                title="Recent payments"
                actions={
                  <Link to="/app/payments" className="text-xs font-medium text-brand-400 hover:text-brand-300">
                    View all
                  </Link>
                }
              />
              {recentPayments.length === 0 ? (
                <EmptyState
                  compact
                  icon={CreditCard}
                  title="No payments yet"
                  message="Your EMI payments will appear here."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentPayments.map((payment) => (
                    <li key={payment._id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {titleCase(payment.type)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {date(payment.paidAt)} · {payment.loanAccount?.loanNo}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-success-700">
                        {currency(payment.amount, { decimals: 2 })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
