/**
 * The app's "working" indicator, in its own module so both Button and States
 * can use it without an import cycle (States imports Button).
 */
import { cn } from '../../lib/utils.js';

/**
 * Signature "working" indicator: a soft pulsing radial core inside a thin
 * rotating ring. Used instead of a generic spinner wherever the app is
 * genuinely thinking — OTP dispatch, KYC verification, the bureau pull,
 * underwriting. Decorative, so it is hidden from assistive tech; the
 * surrounding element carries the live region and label.
 */
export function GlowOrb({ size = 'md', tone = 'brand', className }) {
  const box =
    { xs: 'h-4 w-4', sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' }[size] ?? 'h-12 w-12';
  // `ink` is for use ON a light fill (the gold CTA, the status buttons),
  // where a rose orb would disappear. There is deliberately no gold tone:
  // gold is rationed to three roles and a loader is not one of them.
  const core =
    tone === 'ink'
      ? 'from-ink/90 via-ink/50 to-transparent'
      : 'from-brand-300/90 via-brand-500/45 to-transparent';

  const ring = tone === 'ink' ? 'border-t-ink/80' : 'border-t-brand-400/90';

  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', box, className)} aria-hidden="true">
      {/* Outer bloom — omitted at xs, where it would just muddy the glyph. */}
      <span
        hidden={size === 'xs'}
        className={cn(
          'absolute inset-0 animate-pulse-glow rounded-full blur-md',
          'bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))]',
          core
        )}
      />
      {/* Solid core */}
      <span
        className={cn(
          'absolute inset-[30%] animate-pulse-glow rounded-full',
          'bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))]',
          core
        )}
      />
      {/* Thin rotating ring */}
      <span
        className={cn(
          'absolute inset-0 animate-spin-slow rounded-full',
          tone === 'ink' ? 'border border-ink/20' : 'border border-white/10',
          ring
        )}
      />
    </span>
  );
}

export default GlowOrb;
