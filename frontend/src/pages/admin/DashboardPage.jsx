/**
 * Operations dashboard: portfolio KPIs, application-status mix, disbursement
 * trend, overdue ageing and a live activity feed.
 *
 * Everything is aggregated server-side from live collections — a fresh install
 * legitimately reads zero, and the charts render their own empty states rather
 * than inventing data.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  Wallet,
  AlertTriangle,
  Users,
  Landmark,
  TrendingUp,
  Gauge,
  CreditCard,
} from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { LifecycleFlow } from '../../components/ui/LifecycleFlow.jsx';
import { RadialGauge } from '../../components/ui/RadialGauge.jsx';
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx';
import { EmptyState, LoadingState, ErrorState } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { http } from '../../lib/api.js';
import { currency, currencyCompact, number, timeAgo, titleCase } from '../../lib/format.js';
import { statusMeta } from '../../lib/constants.js';
import {
  CHART_COLORS,
  CHART_TOKENS,
  AGEING_COLORS,
  GRID_PROPS,
  AXIS_PROPS,
  TOOLTIP_STYLE,
} from '../../lib/chartTheme.js';
import { cn } from '../../lib/utils.js';


/** Ranges the six-month trend payload can honestly support. */
const TREND_RANGES = [
  { months: 3, label: '3M' },
  { months: 6, label: '6M' },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState(6);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => http.get('/dashboard/admin'),
  });

  if (isLoading) return <LoadingState label="Loading the portfolio…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { kpis, applicationsByStatus, overdueBuckets, trend, recentActivity } = data;

  // Sparkline series, taken straight from the six-month trend above. Only the
  // KPIs that genuinely have history get one.
  const rangedTrend = (trend ?? []).slice(-range);
  const applicationsSeries = trend?.map((point) => point.applications) ?? [];
  const disbursedCountSeries = trend?.map((point) => point.disbursedCount) ?? [];
  const disbursedAmountSeries = trend?.map((point) => point.disbursedAmount) ?? [];

  // Only statuses that actually occur are charted, so the donut is never noise.
  const statusData = Object.entries(applicationsByStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ name: statusMeta(status).label, value: count, status }));

  /**
   * Portfolio pipeline, as connected nodes. Every figure is a real count from
   * the payload — no stage is invented. Per-application sub-steps (KYC,
   * document checks, the bureau pull) are not portfolio statuses in this data
   * model; they appear on an application's own stepper instead.
   */
  const byStatus = (key) => applicationsByStatus[key] ?? 0;
  const inReview = byStatus('in_review') + byStatus('sent_back');
  const lifecycleStages = [
    {
      key: 'submitted',
      count: byStatus('submitted'),
      label: 'Application',
      icon: ClipboardList,
      value: number(byStatus('submitted')),
      hint: 'awaiting pickup',
      detail:
        'Applications filed by customers and not yet picked up for assessment. Each one carries its own KYC, document and credit-check sub-steps.',
    },
    {
      key: 'underwriting',
      count: inReview,
      label: 'Underwriting',
      icon: Gauge,
      value: number(inReview),
      hint: 'with an officer',
      detail:
        'Applications a credit officer is assessing, including any sent back to the customer for more information.',
    },
    {
      key: 'approved',
      count: kpis.approved,
      label: 'Approved',
      icon: CheckCircle2,
      value: number(kpis.approved),
      hint: 'offer to e-sign',
      detail:
        'Approved, offer accepted or agreement signed — everything sanctioned but not yet paid out.',
    },
    {
      key: 'disbursed',
      count: kpis.disbursed,
      label: 'Disbursement',
      icon: Banknote,
      value: number(kpis.disbursed),
      hint: currencyCompact(kpis.totalDisbursedAmount),
      detail: `${currencyCompact(kpis.totalDisbursedAmount)} sanctioned, ${currencyCompact(kpis.netDisbursedAmount)} released net of fees.`,
    },
    {
      key: 'repaying',
      count: kpis.activeLoans,
      label: 'EMI repayment',
      icon: CreditCard,
      value: number(kpis.activeLoans),
      hint: `${currencyCompact(kpis.principalOutstanding)} outstanding`,
      detail: `Live loan accounts on the book, with ${currencyCompact(kpis.principalOutstanding)} of principal outstanding and ${currencyCompact(kpis.totalCollected)} collected to date.`,
    },
    {
      key: 'closed',
      count: kpis.closedLoans,
      label: 'Closure',
      icon: CheckCircle2,
      value: number(kpis.closedLoans),
      hint: 'repaid or foreclosed',
      detail: 'Accounts settled in full, either by running to term or by early foreclosure.',
    },
    {
      key: 'rejected',
      count: kpis.rejected,
      label: 'Declined',
      icon: XCircle,
      value: number(kpis.rejected),
      hint: 'did not proceed',
      tone: kpis.rejected > 0 ? 'blocked' : 'upcoming',
      detail:
        'Applications declined by policy or by an officer. Kept on the pipeline so the drop-off is visible rather than hidden.',
    },
  ];

  /**
   * Where the pipeline actually is: the furthest stage that has volume in it.
   * `Declined` is excluded — it is a terminal branch off the pipeline, not a
   * point along it.
   */
  const currentStageIndex = lifecycleStages.reduce(
    (furthest, stage, index) =>
      stage.key !== 'rejected' && stage.count > 0 ? index : furthest,
    0
  );

  /**
   * Month-on-month change in disbursed value — a real delta from the trend
   * series, not a decorative one. Null when there is no prior month to
   * compare against, so nothing is invented.
   */
  const monthOverMonth = (() => {
    if (!trend || trend.length < 2) return null;
    const latest = trend[trend.length - 1]?.disbursedAmount ?? 0;
    const previous = trend[trend.length - 2]?.disbursedAmount ?? 0;
    if (previous === 0) return null;
    return Math.round(((latest - previous) / previous) * 1000) / 10;
  })();

  /**
   * The live book split by ageing bucket, for the radial gauge. `current` is
   * everything live and not past due; the rest are the real overdue buckets.
   */
  const currentAccounts = Math.max(0, kpis.activeLoans - kpis.overdueAccounts);
  const gaugeSegments = [
    { key: 'current', label: 'Current', value: currentAccounts, color: CHART_TOKENS.success },
    ...overdueBuckets.map((row) => ({
      key: row.bucket,
      label: row.label,
      value: row.accounts,
      color: AGEING_COLORS[row.bucket],
    })),
  ];
  const healthPct = kpis.activeLoans > 0 ? Math.round((currentAccounts / kpis.activeLoans) * 100) : null;
  const healthPill =
    kpis.activeLoans === 0
      ? { label: 'No live accounts', tone: 'success' }
      : healthPct >= 95
        ? { label: 'On track', tone: 'success' }
        : healthPct >= 80
          ? { label: 'Watch', tone: 'warning' }
          : { label: 'Needs attention', tone: 'danger' };

  const hasTrend = trend.some((row) => row.applications > 0 || row.disbursedCount > 0);
  const hasOverdue = overdueBuckets.some((row) => row.accounts > 0);

  return (
    <div data-testid={TESTIDS.adminDashboard.root}>
      <PageHeader
        title="Operations dashboard"
        subtitle={`Live portfolio view · signed in as ${titleCase(user.role)}`}
      />

      {/* ---------------- Loan lifecycle, as connected nodes ---------------- */}
      <LifecycleFlow
        stages={lifecycleStages}
        currentIndex={currentStageIndex}
        title="Loan lifecycle"
        subtitle="Live pipeline — select a stage for detail"
        testId={TESTIDS.adminDashboard.lifecycle}
        className="mb-4"
      />

      {/* ---------------- Origination KPIs ---------------- */}
      <StatGrid className="mb-4">
        <StatCard
          label="Total applications"
          value={number(kpis.totalApplications)}
          hint="All time"
          icon={ClipboardList}
          tone="brand"
          series={applicationsSeries}
          to="/admin/applications"
          testId={TESTIDS.adminDashboard.kpiApplications}
        />
        <StatCard
          label="Pending review"
          value={number(kpis.pendingReview)}
          hint={kpis.pendingReview ? 'Awaiting a credit decision' : 'Queue is clear'}
          icon={Clock}
          tone="warning"
          to="/admin/applications"
          testId={TESTIDS.adminDashboard.kpiPending}
        />
        <StatCard
          label="Approved"
          value={number(kpis.approved)}
          hint="Approved, accepted or signed"
          icon={CheckCircle2}
          tone="success"
          testId={TESTIDS.adminDashboard.kpiApproved}
        />
        <StatCard
          label="Rejected"
          value={number(kpis.rejected)}
          hint="Declined applications"
          icon={XCircle}
          tone="danger"
          testId={TESTIDS.adminDashboard.kpiRejected}
        />
      </StatGrid>

      {/* ---------------- Portfolio KPIs ---------------- */}
      <StatGrid className="mb-3">
        <StatCard
          label="Loans disbursed"
          value={number(kpis.disbursed)}
          hint={`${currencyCompact(kpis.totalDisbursedAmount)} sanctioned`}
          icon={Banknote}
          tone="success"
          series={disbursedCountSeries}
          to="/admin/loans"
          testId={TESTIDS.adminDashboard.kpiDisbursed}
        />
        <StatCard
          label="Total disbursed"
          value={currencyCompact(kpis.totalDisbursedAmount)}
          hint={`${currencyCompact(kpis.netDisbursedAmount)} net of fees`}
          icon={TrendingUp}
          tone="brand"
          series={disbursedAmountSeries}
          featured
          testId={TESTIDS.adminDashboard.kpiDisbursedAmount}
        />
        <StatCard
          label="Active loans"
          value={number(kpis.activeLoans)}
          hint={`${currencyCompact(kpis.principalOutstanding)} outstanding`}
          icon={Wallet}
          tone="brand"
          to="/admin/loans"
          testId={TESTIDS.adminDashboard.kpiActiveLoans}
        />
        <StatCard
          label="Overdue accounts"
          value={number(kpis.overdueAccounts)}
          hint={
            kpis.totalOverdueAmount > 0
              ? `${currencyCompact(kpis.totalOverdueAmount)} past due`
              : 'Nothing past due'
          }
          icon={AlertTriangle}
          tone={kpis.overdueAccounts > 0 ? 'danger' : 'neutral'}
          to="/admin/collections"
          testId={TESTIDS.adminDashboard.kpiOverdue}
        />
      </StatGrid>

      {/* ---------------- Master-data KPIs ---------------- */}
      <StatGrid className="mb-5">
        <StatCard
          label="Total users"
          value={number(kpis.totalUsers)}
          hint={`${number(kpis.totalCustomers)} customers · ${number(kpis.totalStaff)} staff`}
          icon={Users}
          tone="neutral"
          to="/admin/users"
          testId={TESTIDS.adminDashboard.kpiUsers}
        />
        <StatCard
          label="Partner banks"
          value={number(kpis.totalBanks)}
          hint="Disbursement and partner accounts"
          icon={Landmark}
          tone="neutral"
          to="/admin/banks"
          testId={TESTIDS.adminDashboard.kpiBanks}
        />
        <StatCard
          label="Total collected"
          value={currencyCompact(kpis.totalCollected)}
          hint="Principal, interest and fees"
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="Closed loans"
          value={number(kpis.closedLoans)}
          hint="Repaid or foreclosed"
          icon={CheckCircle2}
          tone="neutral"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------- Trend: clean line, no axes or gridlines ---------------- */}
        <Card className="lg:col-span-2" testId={TESTIDS.adminDashboard.trendChart}>
          <CardHeader
            title="Report"
            subtitle="Disbursed value"
            actions={
              <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.05] p-0.5">
                {TREND_RANGES.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    onClick={() => setRange(option.months)}
                    aria-pressed={range === option.months}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ease-out-soft',
                      range === option.months
                        ? 'bg-white/[0.12] text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />
          <CardBody>
            {!hasTrend ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title="No activity to chart yet"
                message="Once applications are submitted and loans disbursed, the trend appears here."
              />
            ) : (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="hero-number text-3xl leading-none">
                      {currencyCompact(kpis.totalDisbursedAmount)}
                    </p>
                    {monthOverMonth != null ? (
                      <p
                        className={cn(
                          'mt-2 text-xs font-medium',
                          monthOverMonth >= 0 ? 'text-success-500' : 'text-danger-500'
                        )}
                      >
                        {monthOverMonth >= 0 ? '+' : ''}
                        {monthOverMonth}% from the previous month
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Disbursed to date</p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {rangedTrend[0]?.label} – {rangedTrend[rangedTrend.length - 1]?.label}
                  </p>
                </div>

                {/* Axis-less, gridless line: the figure above carries the scale. */}
                <div className="mt-5 h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rangedTrend} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value) => currency(value)}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="disbursedAmount"
                        name="Disbursed"
                        stroke={CHART_TOKENS.roseLight}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: CHART_TOKENS.roseLight }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Portfolio health gauge ---------------- */}
        <Card testId={TESTIDS.adminDashboard.healthGauge}>
          <CardHeader title="Portfolio health" />
          <CardBody>
            {kpis.activeLoans === 0 ? (
              <EmptyState
                compact
                icon={Wallet}
                title="No live accounts"
                message="Once loans are disbursed, the ageing split appears here."
              />
            ) : (
              <RadialGauge
                segments={gaugeSegments}
                value={currencyCompact(kpis.principalOutstanding)}
                caption="Principal outstanding"
                percent={`${healthPct}%`}
                percentLabel="Accounts current"
                pill={healthPill}
                footnote={`${number(kpis.activeLoans)} live account(s) · ${number(kpis.overdueAccounts)} past due`}
              />
            )}
          </CardBody>
        </Card>

        {/* ---------------- Status mix ---------------- */}
        <Card testId={TESTIDS.adminDashboard.statusChart}>
          <CardHeader title="Applications by status" />
          <CardBody>
            {statusData.length === 0 ? (
              <EmptyState
                compact
                icon={ClipboardList}
                title="No applications yet"
                message="The status breakdown appears once customers start applying."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Ageing ---------------- */}
        <Card className="lg:col-span-2" testId={TESTIDS.adminDashboard.bucketChart}>
          <CardHeader title="Overdue accounts by ageing bucket" subtitle="Days past due" />
          <CardBody>
            {!hasOverdue ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Nothing overdue"
                message="Every live loan account is current."
              />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overdueBuckets} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" {...AXIS_PROPS} />
                    <YAxis
                      allowDecimals={false}
                      {...AXIS_PROPS}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value, name) =>
                        name === 'Overdue amount' ? currency(value) : value
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: CHART_TOKENS.textSecondary }} iconType="circle" iconSize={8} />
                    <Bar dataKey="accounts" name="Accounts" fill={CHART_TOKENS.roseLight} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    <Bar dataKey="amount" name="Overdue amount" fill={CHART_TOKENS.danger} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Activity feed ---------------- */}
        <Card testId={TESTIDS.adminDashboard.activityFeed}>
          <CardHeader title="Recent activity" subtitle="Live audit trail" />
          {recentActivity.length === 0 ? (
            <EmptyState compact title="No activity yet" message="Actions taken in the app appear here." />
          ) : (
            <ul className="scrollbar-thin max-h-[22rem] divide-y divide-slate-100 overflow-y-auto">
              {recentActivity.map((entry) => (
                <li
                  key={entry._id}
                  data-testid={TESTIDS.adminDashboard.activityItem}
                  className="flex gap-3 px-4 py-3"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800">
                      {entry.description || titleCase(entry.action)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {entry.performedByName} · {timeAgo(entry.timestamp)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
