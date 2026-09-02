/**
 * Progress stepper for the multi-step origination journey.
 *
 * One DOM node per step at every breakpoint — the same `data-testid` resolves on
 * desktop and mobile (responsive testid rule). Only the presentation changes:
 * mobile adds a "Step 3 of 8" summary above the track and hides the per-step
 * labels; from `sm` up the labels appear and the track spreads out.
 */
import { Check, X } from 'lucide-react';
import { stepId } from '@shared/testIds.js';
import { APPLICATION_STAGES } from '../../lib/constants.js';
import { cn } from '../../lib/utils.js';

/**
 * @param {object} props
 * @param {string} props.current  the active stage key
 * @param {Array<{key:string,label:string}>} [props.steps]
 * @param {boolean} [props.failed] renders the current step as terminated (rejected)
 */
export function Stepper({ current, steps = APPLICATION_STAGES, failed = false, testId, className }) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === current)
  );
  const activeStep = steps[currentIndex];

  return (
    <div data-testid={testId} className={className}>
      {/* Mobile-only summary — labels are hidden on the track at this size. */}
      <div className="mb-3 flex items-baseline justify-between sm:hidden">
        <p className="text-sm font-semibold text-slate-900">
          {activeStep?.label}
          {failed ? ' — stopped' : ''}
        </p>
        <p className="text-xs text-slate-500">
          Step {currentIndex + 1} of {steps.length}
        </p>
      </div>

      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFailed = isCurrent && failed;

          return (
            <li key={step.key} className="flex flex-1 items-start last:flex-none">
              <div
                data-testid={stepId(step.key)}
                data-state={
                  isComplete ? 'complete' : isCurrent ? (failed ? 'failed' : 'current') : 'upcoming'
                }
                title={step.label}
                className="flex min-w-0 flex-col items-center gap-1.5 sm:px-1"
              >
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full border-2 font-semibold transition',
                    'h-6 w-6 text-[10px] sm:h-7 sm:w-7 sm:text-xs',
                    isFailed && 'border-danger-500 bg-danger-500 text-white',
                    !isFailed && isComplete && 'border-transparent bg-brand-gradient text-white',
                    !isFailed &&
                      isCurrent &&
                      'border-brand-400 bg-canvas-raised text-brand-300 ring-4 ring-brand-500/20',
                    !isComplete && !isCurrent && 'border-white/15 bg-white/[0.06] text-slate-400'
                  )}
                >
                  {isFailed ? (
                    <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : isComplete ? (
                    <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>

                {/* Labels only from sm up; the mobile summary above covers this. */}
                <span
                  className={cn(
                    'hidden max-w-[88px] text-center text-[11px] font-medium leading-tight sm:block',
                    isCurrent ? 'text-slate-900' : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-3 h-0.5 flex-1 rounded-full sm:mt-3.5',
                    index < currentIndex ? 'bg-brand-500' : 'bg-white/[0.08]'
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Simple labelled progress bar (loan repayment progress, etc.). */
export function ProgressBar({ value = 0, label, testId, tone = 'brand', className }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const tones = {
    brand: 'bg-brand-gradient',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  };

  return (
    <div data-testid={testId} className={className}>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-slate-600">{label}</span>
          <span className="font-semibold text-slate-900">{pct}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-all', tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default Stepper;
