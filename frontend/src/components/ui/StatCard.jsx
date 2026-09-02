/** KPI tile for the dashboards. Value + label + optional icon, sparkline, trend and link. */
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const TONES = {
  brand: 'bg-brand-500/18 text-brand-300 ring-1 ring-inset ring-brand-500/25',
  success: 'bg-success-500/15 text-success-500 ring-1 ring-inset ring-success-500/25',
  warning: 'bg-warning-500/15 text-warning-500 ring-1 ring-inset ring-warning-500/25',
  danger: 'bg-danger-500/15 text-danger-500 ring-1 ring-inset ring-danger-500/25',
  neutral: 'bg-white/[0.06] text-slate-500 ring-1 ring-inset ring-white/10',
};

/**
 * Inline sparkline in rose — the secondary accent — so it reads as
 * supporting data against the burgundy primary, and never competes with the
 * rationed gold. Purely decorative: the figure it illustrates is already in
 * the DOM as text, so it is hidden from assistive tech.
 */
function Sparkline({ series, tone = 'accent' }) {
  const gradientId = useId();
  const points = series.filter((n) => Number.isFinite(n));
  if (points.length < 2) return null;

  const W = 96;
  const H = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((n, i) => {
    const x = (i / (points.length - 1)) * W;
    // 2px inset top and bottom so the stroke is never clipped.
    const y = H - 2 - ((n - min) / span) * (H - 4);
    return [x, y];
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  // Rose is the secondary-accent / data colour. The lighter rose is used for
  // the stroke so a 1.75px line still clears 3:1 on the lightened glass.
  const stroke = tone === 'accent' ? '#EC7BA4' : '#BE185D';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-24 shrink-0 overflow-visible"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  to,
  testId,
  valueTestId,
  className,
  loading = false,
  /** Numeric history for the sparkline. Rendered only when 2+ finite points. */
  series,
  /** Signed percentage delta shown next to the value, e.g. 12.5 or -3. */
  trend,
  /**
   * Marks this as the highlighted card on the screen: adds the one gold
   * hairline gold is allowed on a card (role #3). Use on at most one tile.
   */
  featured = false,
  /** Stagger index, so a grid of tiles fades in in sequence. */
  index = 0,
}) {
  const hasSparkline = Array.isArray(series) && series.filter((n) => Number.isFinite(n)).length > 1;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  const content = (
    <>
      {/* Muted label above the figure, per the reference layout. */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {Icon ? (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <div className="h-7 w-24 animate-pulse rounded bg-white/10" />
          ) : (
            <p
              data-testid={valueTestId}
              className="hero-number truncate text-[26px] leading-none"
              title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
            >
              {value}
            </p>
          )}

          {Number.isFinite(trend) ? (
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-xs font-medium',
                trend >= 0 ? 'text-success-500' : 'text-danger-500'
              )}
            >
              <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {trend >= 0 ? '+' : ''}
              {trend}%
            </p>
          ) : null}
        </div>

        {hasSparkline && !loading ? <Sparkline series={series} tone="accent" /> : null}
      </div>

      {hint ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          {hint}
          {to ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : null}
        </p>
      ) : null}
    </>
  );

  const base = cn(
    'card glass-interactive animate-panel-in p-5',
    featured && 'accent-line',
    to && 'cursor-pointer',
    className
  );

  // Capped so a long grid never feels slow.
  const style = { animationDelay: `${Math.min(index, 8) * 40}ms` };

  if (to) {
    return (
      <Link to={to} data-testid={testId} className={cn(base, 'block')} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div data-testid={testId} className={base} style={style}>
      {content}
    </div>
  );
}

/** Responsive KPI grid — 1 up on mobile, 2 on tablet, 4 on desktop. */
export function StatGrid({ children, className, testId, ...props }) {
  return (
    <div
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </div>
  );
}

export default StatCard;
