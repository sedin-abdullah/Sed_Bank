/** Display formatting helpers (Indian locale conventions). */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/** ₹1,23,456 — no decimals, for headline figures. */
export const currency = (value, { decimals = 0 } = {}) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

/** ₹1,23,456.78 — for ledger rows where the paisa matters. */
export const currencyExact = (value) => currency(value, { decimals: 2 });

/** Compact form for KPI tiles: ₹12.5L, ₹1.2Cr. */
export const currencyCompact = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(abs >= 1e8 ? 0 : 2)}Cr`;
  if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(abs >= 1e6 ? 0 : 2)}L`;
  if (abs >= 1000) return `₹${(amount / 1000).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return currency(amount);
};

export const number = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('en-IN') : '—';
};

export const percent = (value, decimals = 1) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(decimals)}%` : '—';
};

/** A 0..1 ratio rendered as a percentage (FOIR/DTI). */
export const ratioPercent = (value, decimals = 1) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${(amount * 100).toFixed(decimals)}%` : '—';
};

export const date = (value) => (value ? dayjs(value).format('DD MMM YYYY') : '—');
export const dateTime = (value) => (value ? dayjs(value).format('DD MMM YYYY, HH:mm') : '—');
export const timeAgo = (value) => (value ? dayjs(value).fromNow() : '—');

/** Days until a date — negative once it is in the past. */
export const daysUntil = (value) =>
  value ? dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day') : null;

/** "in 5 days" / "3 days overdue" / "due today". */
export const dueLabel = (value) => {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days === 0) return 'Due today';
  if (days > 0) return `Due in ${days} day${days === 1 ? '' : 's'}`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
};

/** snake_case -> Title Case, for enum values without an explicit label. */
export const titleCase = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const maskAccount = (value) => {
  const str = String(value || '');
  return str.length > 4 ? `XXXX${str.slice(-4)}` : str;
};

export const fileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Reducing-balance EMI, mirrored from the backend so the apply form can show a
 * live preview without a round-trip. The binding figure always comes from the API.
 */
export const calculateEmi = (principal, annualRatePct, months) => {
  const P = Number(principal);
  const n = Number(months);
  const r = Number(annualRatePct) / 12 / 100;
  if (!(P > 0) || !(n > 0)) return 0;
  if (r === 0) return Math.round((P / n) * 100) / 100;
  const factor = Math.pow(1 + r, n);
  return Math.round(((P * r * factor) / (factor - 1)) * 100) / 100;
};
