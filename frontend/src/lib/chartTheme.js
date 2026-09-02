/**
 * Shared Recharts theme for the dark glass UI.
 *
 * Recharts styles its SVG through props, not CSS, so these values cannot come
 * from Tailwind classes. They are kept here — one module, imported by every
 * charting screen — so no page hardcodes its own palette. The hexes mirror the
 * tokens in tailwind.config.js; keep the two in step.
 */

// Mirrors tailwind.config.js ("Wine Reserve"). Update both together.
export const CHART_TOKENS = {
  brand: '#9F1239', // burgundy — primary accent
  rose: '#BE185D', // rose — secondary accent / data series
  roseLight: '#EC7BA4', // lighter rose, for thin strokes on lightened glass
  accent: '#EC7BA4', // series colour where a 1-2px stroke must stay visible
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  textSecondary: '#B8A9AC',
  surface: '#1F0F16', // canvas.raised
  border: 'rgba(255, 255, 255, 0.10)',
};

/**
 * Gold is deliberately ABSENT from the chart palette. It is rationed to the
 * primary CTA, the active nav item and one featured-card hairline; letting it
 * into a data series would break that.
 */

/**
 * Categorical series palette. Ordered for maximum separation between
 * neighbours, and every entry clears 3:1 against the dark base so a thin
 * stroke or a small pie slice stays visible.
 */
export const CHART_COLORS = [
  CHART_TOKENS.roseLight,
  CHART_TOKENS.success,
  CHART_TOKENS.warning,
  CHART_TOKENS.danger,
  CHART_TOKENS.rose,
  '#C084FC', // muted violet, for a sixth category
  CHART_TOKENS.textSecondary,
];

/**
 * Delinquency ageing ramp: green for current, then escalating warmth as the
 * bucket ages, ordered so severity reads without the legend.
 *
 * It deliberately starts at pale ORANGE rather than the amber warning token.
 * Amber (#FBBF24) sits close enough to the reserved gold (#D4AF37) that a
 * large amber arc or bar reads as gold, which would undercut rationing gold
 * to three roles. Amber is still the warning tone for small elements —
 * badges, a KPI icon chip — where there is no such confusion.
 */
export const AGEING_COLORS = {
  current: CHART_TOKENS.success,
  '1-30': '#FDBA74', // pale orange
  '31-60': '#FB923C', // orange
  '61-90': CHART_TOKENS.danger,
  '90+': '#DC2626', // deepest red in the ramp
};

/** Faint horizontal rules — visible on dark, never competing with the data. */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'rgba(255, 255, 255, 0.07)',
  vertical: false,
};

/** Axis ticks in the secondary text colour, with no axis or tick lines. */
export const AXIS_PROPS = {
  tick: { fontSize: 11, fill: CHART_TOKENS.textSecondary },
  axisLine: false,
  tickLine: false,
};

/** Tooltip as a small glass panel rather than the default white card. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 12,
    border: `1px solid ${CHART_TOKENS.border}`,
    background: 'rgba(31, 15, 22, 0.95)',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.60)',
    color: '#F8FAFC',
    fontSize: 12,
  },
  labelStyle: { color: CHART_TOKENS.textSecondary, fontSize: 11 },
  itemStyle: { color: '#F8FAFC' },
  cursor: { fill: 'rgba(190, 24, 93, 0.10)' },
};

export default {
  CHART_TOKENS,
  CHART_COLORS,
  AGEING_COLORS,
  GRID_PROPS,
  AXIS_PROPS,
  TOOLTIP_STYLE,
};
