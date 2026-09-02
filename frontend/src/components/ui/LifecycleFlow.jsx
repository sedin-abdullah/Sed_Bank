/**
 * The loan lifecycle as a row of glowing, connected nodes.
 *
 * One shared interaction language, used on every dashboard:
 *  - nodes are connected by hairline connectors whose dashes flow while the
 *    pipeline is live, and go inert past the current stage;
 *  - the current stage pulses softly;
 *  - clicking a node pans it toward the centre and scales the track slightly
 *    (a gentle zoom), then a glass detail panel flies in from that node's
 *    position — the panel's transform-origin is the node itself;
 *  - hovering a node brightens its hairline and briefly lifts the connectors
 *    either side of it.
 *
 * All motion is opacity / scale / glow, 200-400ms, ease-out. The OS
 * "reduce motion" setting disables the drift, flow and pulse globally
 * (see index.css).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/** Tone -> node ring/fill classes. Wine by default; gold is never used here. */
const TONES = {
  done: {
    dot: 'bg-brand-gradient text-white',
    ring: 'ring-brand-500/30',
    label: 'text-slate-700',
  },
  current: {
    dot: 'bg-brand-gradient text-white',
    ring: 'ring-brand-400/45',
    label: 'text-slate-900',
  },
  upcoming: {
    dot: 'bg-white/[0.06] text-slate-500',
    ring: 'ring-white/10',
    label: 'text-slate-500',
  },
  blocked: {
    dot: 'bg-danger-500/85 text-ink',
    ring: 'ring-danger-500/35',
    label: 'text-danger-700',
  },
};

export function LifecycleFlow({
  /** [{ key, label, icon, value, hint, detail, tone }] — tone defaults by index vs currentIndex. */
  stages,
  /** Index of the stage the pipeline is currently sitting at. */
  currentIndex = 0,
  title,
  subtitle,
  testId,
  className,
  /**
   * Draw the component's own glass panel. Set false when it is already
   * inside a Card, so we don't stack glass on glass.
   */
  surface = true,
}) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [offset, setOffset] = useState(0);

  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const nodeRefs = useRef([]);

  const selectedStage = selected === null ? null : stages[selected];

  /** Pan the chosen node toward the centre of the viewport. */
  const recomputeOffset = useCallback(() => {
    if (selected === null) {
      setOffset(0);
      return;
    }
    const viewport = viewportRef.current;
    const node = nodeRefs.current[selected];
    if (!viewport || !node) return;

    // Only pan when the track is wide enough for panning to mean anything.
    const track = trackRef.current;
    if (!track || track.scrollWidth <= viewport.clientWidth + 8) {
      setOffset(0);
      return;
    }
    const target = node.offsetLeft + node.offsetWidth / 2;
    const centre = viewport.clientWidth / 2;
    const max = Math.max(0, track.scrollWidth - viewport.clientWidth);
    setOffset(-Math.min(Math.max(target - centre, 0), max));
  }, [selected]);

  useLayoutEffect(recomputeOffset, [recomputeOffset]);

  useEffect(() => {
    const onResize = () => recomputeOffset();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeOffset]);

  // Escape closes the detail panel, matching the modal language.
  useEffect(() => {
    if (selected === null) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const toneFor = (index, stage) => {
    if (stage.tone) return stage.tone;
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div
      data-testid={testId}
      className={cn('animate-panel-in', surface && 'card p-5 sm:p-6', className)}
    >
      {title ? (
        <div className="mb-4">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      ) : null}

      {/* Viewport clips the pan so the page body never scrolls sideways. */}
      <div ref={viewportRef} className="overflow-hidden">
        <div
          ref={trackRef}
          style={{ transform: `translateX(${offset}px) scale(${selected === null ? 1 : 1.04})` }}
          className={cn(
            'flex origin-left flex-col gap-0 transition-transform duration-300 ease-out-soft sm:flex-row sm:items-start'
          )}
        >
          {stages.map((stage, index) => {
            const tone = TONES[toneFor(index, stage)] ?? TONES.upcoming;
            const isSelected = selected === index;
            const isCurrent = index === currentIndex && !stage.tone;
            // A connector is live up to the current stage, inert beyond it.
            const live = index < currentIndex;
            const adjacent = hovered === index || hovered === index + 1;
            const Icon = stage.icon;

            return (
              <div
                key={stage.key}
                className="flex flex-1 flex-row items-start gap-0 sm:flex-col sm:items-stretch"
              >
                <div className="flex flex-col items-center sm:flex-row">
                  <button
                    type="button"
                    ref={(el) => {
                      nodeRefs.current[index] = el;
                    }}
                    onClick={() => setSelected(isSelected ? null : index)}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    aria-expanded={isSelected}
                    aria-label={`${stage.label}${stage.value != null ? ` — ${stage.value}` : ''}`}
                    data-state={toneFor(index, stage)}
                    className={cn(
                      'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                      'ring-1 ring-inset transition-all duration-200 ease-out-soft',
                      'focus-visible:outline-none',
                      tone.dot,
                      tone.ring,
                      isSelected && 'scale-110 shadow-glow-brand',
                      !isSelected && 'hover:scale-105 hover:ring-white/25'
                    )}
                  >
                    {/* Soft halo on the stage the pipeline is sitting at. */}
                    {isCurrent ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-node-pulse rounded-full bg-brand-400/40"
                      />
                    ) : null}
                    {Icon ? (
                      <Icon className="relative h-[18px] w-[18px]" aria-hidden="true" />
                    ) : (
                      <span className="relative text-xs font-semibold">{index + 1}</span>
                    )}
                  </button>

                  {/* Connector to the next stage. Horizontal from `sm` up. */}
                  {index < stages.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'shrink-0 rounded-full transition-opacity duration-200 ease-out-soft',
                        'my-1 h-8 w-px sm:my-0 sm:ml-2 sm:mr-2 sm:h-px sm:w-full sm:flex-1',
                        live ? 'connector-v sm:connector-h' : 'connector-idle',
                        adjacent ? 'opacity-100' : 'opacity-70'
                      )}
                    />
                  ) : null}
                </div>

                {/* Label + figure under (or beside) the node. */}
                <div className="min-w-0 pb-6 pl-3 pt-1 sm:pb-0 sm:pl-0 sm:pr-4 sm:pt-3">
                  <p
                    className={cn(
                      'truncate text-[11px] font-semibold uppercase tracking-wide transition-colors',
                      tone.label
                    )}
                  >
                    {stage.label}
                  </p>
                  {stage.value != null ? (
                    <p className="hero-number mt-1 text-lg leading-none">{stage.value}</p>
                  ) : null}
                  {stage.hint ? (
                    <p className="mt-1 truncate text-[11px] text-slate-500">{stage.hint}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Detail panel — flies in from the selected node's position.
        No gold hairline here on purpose: the featured KPI tile already owns
        that role on these screens, and two gold hairlines at once would
        break the "gold in exactly three places" rule.
      */}
      {selectedStage ? (
        <div
          role="region"
          aria-label={`${selectedStage.label} detail`}
          style={{
            transformOrigin: `${
              nodeRefs.current[selected]
                ? nodeRefs.current[selected].offsetLeft +
                  nodeRefs.current[selected].offsetWidth / 2 +
                  offset
                : 0
            }px top`,
          }}
          className="glass-strong animate-fly-in mt-5 p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Stage {selected + 1} of {stages.length}
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-slate-900">
                {selectedStage.label}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close stage detail"
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedStage.value != null ? (
            <p className="hero-number mt-4 inline-block text-3xl">
              {selectedStage.value}
            </p>
          ) : null}

          {selectedStage.detail ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
              {selectedStage.detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default LifecycleFlow;
