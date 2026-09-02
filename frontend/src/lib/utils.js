import clsx from 'clsx';

/** Conditional class names. */
export const cn = (...inputs) => clsx(inputs);

/** Extracts a user-facing message from any thrown value. */
export const errorMessage = (error, fallback = 'Something went wrong.') =>
  error?.message || fallback;

/** Field-keyed validation messages from an ApiError, if present. */
export const fieldErrorsOf = (error) => error?.fieldErrors ?? {};

/** Debounce, used by the table search inputs. */
export const debounce = (fn, wait = 300) => {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

/** Strips empty strings/null/undefined so they are not sent as query params. */
export const compact = (object) =>
  Object.fromEntries(
    Object.entries(object || {}).filter(
      ([, value]) => value !== '' && value !== null && value !== undefined
    )
  );

export default { cn, errorMessage, fieldErrorsOf, debounce, compact };
