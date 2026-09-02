import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';
import { GlowOrb } from './GlowOrb.jsx';

/**
 * Variants read from the design tokens in tailwind.config.js.
 *
 * `primary` is the burgundy->rose brand gradient; white text clears AA at
 * both ends of it (8.0:1 / 6.0:1), so no deepened variant is needed.
 *
 * `cta` is the rationed gold — ONE primary action per screen, and one of only
 * three places gold is allowed at all (see the token file). It carries
 * near-black text because gold + white is 2.1:1.
 *
 * Disabled labels use `slate-500`: muted enough to read as inactive, but a
 * step brighter than the icon tone. WCAG 1.4.3 exempts inactive controls from
 * the 4.5:1 minimum, which a fully-muted disabled label would not meet.
 */
const VARIANTS = {
  primary:
    'bg-brand-gradient text-white shadow-glow-brand hover:brightness-110 active:brightness-95 disabled:opacity-50',
  cta: 'bg-gold-gradient text-ink font-semibold shadow-glow-gold hover:brightness-105 active:brightness-95 disabled:opacity-50',
  secondary:
    'bg-white/[0.06] text-slate-800 border border-white/[0.10] backdrop-blur-glass hover:bg-white/[0.11] hover:border-white/[0.18] active:bg-white/[0.08] disabled:text-slate-500 disabled:hover:bg-white/[0.06]',
  ghost:
    'text-slate-600 hover:bg-white/[0.07] hover:text-slate-900 active:bg-white/[0.05] disabled:text-slate-500',
  danger:
    'bg-danger-500/90 text-ink font-semibold hover:bg-danger-400 active:bg-danger-500 disabled:opacity-50',
  success:
    'bg-success-500/90 text-ink font-semibold hover:bg-success-400 active:bg-success-500 disabled:opacity-50',
  outlineDanger:
    'border border-danger-300/40 bg-danger-500/10 text-danger-700 backdrop-blur-glass hover:bg-danger-500/20 hover:border-danger-300/60 disabled:opacity-50',
  link: 'text-brand-300 hover:text-brand-200 hover:underline underline-offset-2 p-0 h-auto',
};

/**
 * Which orb tone reads on each variant's fill. Variants with a light fill
 * (gold CTA, the status buttons) need the dark orb.
 */
const LOADER_TONE = {
  cta: 'ink',
  danger: 'ink',
  success: 'ink',
};

const SIZES = {
  // Touch targets stay >=40px tall so the same buttons work on mobile.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-10 w-10 p-0',
};

/**
 * Primary action button.
 * `loading` disables the button and swaps in a spinner while keeping its width.
 */
const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon: Icon = null,
    iconRight = false,
    className,
    type = 'button',
    fullWidth = false,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-medium',
        'transition-all duration-200 ease-out-soft',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        variant === 'link' ? '' : SIZES[size] ?? SIZES.md,
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <GlowOrb size="xs" tone={LOADER_TONE[variant] ?? 'brand'} />
      ) : (
        Icon && !iconRight && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      {children}
      {!loading && Icon && iconRight && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  );
});

export default Button;
