import { cn } from '../../lib/utils.js';

/**
 * Glass panel. `featured` adds the single gold hairline that gold is allowed
 * on a card (role #3 of three) — use it on at most one card per screen.
 */
export function Card({ children, className, testId, featured = false, ...props }) {
  return (
    <div
      className={cn('card animate-panel-in', featured && 'accent-line', className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className, children }) {
  return (
    <div className={cn('card-header', className)}>
      <div className="min-w-0">
        {title ? <h2 className="card-title">{title}</h2> : null}
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className, ...props }) {
  return (
    <div className={cn('card-body', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-4 sm:px-6', className)}>
      {children}
    </div>
  );
}

/** Label/value pair used across every detail panel. */
export function DataItem({ label, value, testId, className, mono = false }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        data-testid={testId}
        className={cn('mt-1 break-words text-sm text-slate-900', mono && 'font-mono text-[13px]')}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}

/** Responsive grid of DataItems — 1 column on mobile, more on wider screens. */
export function DataGrid({ children, columns = 3, className, testId, ...props }) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <dl className={cn('grid grid-cols-1 gap-4', cols, className)} data-testid={testId} {...props}>
      {children}
    </dl>
  );
}

export default Card;
