/**
 * Colour-coded status chip.
 * Tones come from `statusMeta()` so a given status looks identical everywhere:
 * green approved, red rejected, amber pending, grey closed/neutral.
 */
import { TESTIDS } from '@shared/testIds.js';
import { statusMeta } from '../../lib/constants.js';
import { cn } from '../../lib/utils.js';

const TONES = {
  neutral: 'bg-white/[0.06] text-slate-700 ring-white/10',
  info: 'bg-brand-500/18 text-brand-300 ring-brand-500/25',
  success: 'bg-success-50 text-success-700 ring-success-500/20',
  warning: 'bg-warning-50 text-warning-700 ring-warning-500/20',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/20',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({ tone = 'neutral', size = 'sm', children, className, testId, ...props }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        TONES[tone] ?? TONES.neutral,
        SIZES[size] ?? SIZES.sm,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Renders any domain status value with its canonical label and colour. */
export function StatusBadge({ status, size = 'sm', testId, className }) {
  const meta = statusMeta(status);

  return (
    <Badge
      tone={meta.tone}
      size={size}
      className={cn('capitalize', className)}
      testId={testId || TESTIDS.common.statusBadge}
      data-status={status}
      title={meta.label}
    >
      {meta.label}
    </Badge>
  );
}

/** Small coloured dot + text, for chart legends and compact lists. */
export function Dot({ tone = 'neutral', className }) {
  const colors = {
    neutral: 'bg-slate-400',
    info: 'bg-brand-400',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  };
  return <span className={cn('inline-block h-2 w-2 rounded-full', colors[tone], className)} />;
}

export default Badge;
