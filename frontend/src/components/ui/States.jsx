/**
 * Empty, loading and error states.
 *
 * SedBank ships with no seed data, so empty states are a primary UI surface,
 * not an edge case — every list and dashboard has a friendly one with a
 * next-step action rather than a blank panel.
 */
import { Inbox, AlertTriangle, RefreshCw } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { cn } from '../../lib/utils.js';
import { GlowOrb } from './GlowOrb.jsx';
import Button from './Button.jsx';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  message,
  action,
  actionLabel,
  onAction,
  actionTestId,
  testId,
  className,
  compact = false,
}) {
  return (
    <div
      data-testid={testId || TESTIDS.common.emptyState}
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.07] ring-1 ring-inset ring-white/10">
        <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-sm text-slate-500">{message}</p> : null}

      {action ??
        (actionLabel && onAction ? (
          <Button
            className="mt-4"
            onClick={onAction}
            data-testid={actionTestId || TESTIDS.common.emptyStateAction}
          >
            {actionLabel}
          </Button>
        ) : null)}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', className, compact = false }) {
  return (
    <div
      data-testid={TESTIDS.common.loading}
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3.5 text-sm text-slate-500',
        compact ? 'py-8' : 'py-14',
        className
      )}
    >
      <GlowOrb size={compact ? 'sm' : 'md'} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Shown while the app is genuinely working on something the user is waiting
 * for — the bureau pull, KYC verification, an underwriting decision. Uses the
 * glow orb rather than a spinner, and announces itself politely.
 */
export function WorkingState({ title = 'Working…', message, tone = 'brand', className, testId }) {
  return (
    <div
      data-testid={testId || TESTIDS.common.loading}
      role="status"
      aria-live="polite"
      className={cn(
        'glass-dense animate-panel-in flex flex-col items-center justify-center gap-4 px-6 py-10 text-center',
        className
      )}
    >
      <GlowOrb size="lg" tone={tone} />
      <div>
        <p className="font-display text-[15px] font-semibold tracking-tight text-slate-900">
          {title}
        </p>
        {message ? <p className="mt-1.5 max-w-sm text-sm text-slate-500">{message}</p> : null}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this', className }) {
  return (
    <div
      data-testid={TESTIDS.common.errorState}
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/15 ring-1 ring-inset ring-danger-500/25">
        <AlertTriangle className="h-6 w-6 text-danger-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-500">
        {error?.message || 'An unexpected error occurred.'}
      </p>
      {onRetry ? (
        <Button
          variant="secondary"
          className="mt-4"
          icon={RefreshCw}
          onClick={onRetry}
          data-testid={TESTIDS.common.errorRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Inline banner for form-level (non-field) errors. */
export function FormError({ message, className }) {
  if (!message) return null;
  return (
    <div
      data-testid={TESTIDS.common.formError}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-danger-500/25 bg-danger-500/10 px-3 py-2.5 text-sm text-danger-700',
        className
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

/** Skeleton shimmer used while tables and cards load. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-white/[0.07]', className)} />;
}

export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div className="space-y-2 p-4" data-testid={TESTIDS.common.loading}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton key={colIndex} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { GlowOrb };

export default {
  EmptyState,
  LoadingState,
  WorkingState,
  GlowOrb,
  ErrorState,
  FormError,
  Skeleton,
  TableSkeleton,
};
