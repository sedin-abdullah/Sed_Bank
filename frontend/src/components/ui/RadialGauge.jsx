/**
 * Thick multi-segment radial gauge.
 *
 * A 270° arc with rounded caps, split into proportional segments. Used for
 * "what is this book made of" figures — the loan portfolio by ageing bucket,
 * for instance — with a hero number in the middle.
 *
 * Colours come from the caller (the shared chart theme), never gold: gold is
 * rationed to the CTA, the active nav item and one featured-card hairline.
 */
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils.js';

const SIZE = 220; // viewBox units
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CENTRE = SIZE / 2;

/** 270° of sweep, opening at the bottom. */
const SWEEP = 270;
const START = 135; // degrees, clockwise from 3 o'clock

const polar = (angleDeg) => {
  const rad = (angleDeg * Math.PI) / 180;
  return [CENTRE + RADIUS * Math.cos(rad), CENTRE + RADIUS * Math.sin(rad)];
};

/** An SVG arc path from one angle to another along the gauge radius. */
function arcPath(fromDeg, toDeg) {
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function RadialGauge({
  /** [{ key, label, value, color }] — drawn in order, sized proportionally. */
  segments = [],
  /** Big figure in the middle. */
  value,
  /** Small line under the figure (a real delta, not a decoration). */
  caption,
  /** Percentage rendered bottom-right, with its own label. */
  percent,
  percentLabel,
  /** Small status pill at the top of the panel. */
  pill,
  footnote,
  className,
  testId,
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value || 0), 0);

  // Grow the arc in on mount, so the panel reads as alive without motion noise.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  let cursor = START;
  const drawnSegments = total
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const span = (s.value / total) * SWEEP;
          const from = cursor;
          cursor += span;
          return { ...s, from, to: cursor, span };
        })
    : [];

  return (
    <div data-testid={testId} className={cn('flex flex-col', className)}>
      {pill ? (
        <span
          className={cn(
            'mb-4 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
            pill.tone === 'danger'
              ? 'bg-danger-500/15 text-danger-500 ring-danger-500/25'
              : pill.tone === 'warning'
                ? 'bg-warning-500/15 text-warning-500 ring-warning-500/25'
                : 'bg-success-500/15 text-success-500 ring-success-500/25'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              pill.tone === 'danger'
                ? 'bg-danger-500'
                : pill.tone === 'warning'
                  ? 'bg-warning-500'
                  : 'bg-success-500'
            )}
          />
          {pill.label}
        </span>
      ) : null}

      <div className="relative flex-1">
        {/* Figure sits above the arc, as in the reference layout. */}
        <div className="relative z-10">
          <p className="hero-number text-3xl leading-none">{value}</p>
          {caption ? <p className="mt-2 text-xs text-slate-500">{caption}</p> : null}
        </div>

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mt-2 h-auto w-full max-w-[260px] overflow-visible"
          role="img"
          aria-label={
            segments.length
              ? `Portfolio split: ${segments
                  .filter((s) => s.value > 0)
                  .map((s) => `${s.label} ${s.value}`)
                  .join(', ')}`
              : 'No data yet'
          }
        >
          {/* Track */}
          <path
            d={arcPath(START, START + SWEEP)}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />

          {drawnSegments.map((s) => {
            // Each segment is its own arc, clipped by a dash so it can animate in.
            const length = (s.span / 360) * 2 * Math.PI * RADIUS;
            return (
              <path
                key={s.key}
                d={arcPath(s.from, s.to)}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={length}
                strokeDashoffset={drawn ? 0 : length}
                style={{
                  transition: 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            );
          })}
        </svg>

        {percent != null ? (
          <div className="absolute bottom-1 right-0 text-right">
            <p className="hero-number text-2xl leading-none">{percent}</p>
            {percentLabel ? (
              <p className="mt-1 text-[11px] text-slate-500">{percentLabel}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {footnote ? <p className="mt-3 text-[11px] text-slate-500">{footnote}</p> : null}
    </div>
  );
}

export default RadialGauge;
