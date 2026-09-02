/**
 * Toast/snackbar notifications.
 * Used for form outcomes and for live Socket.IO events ("Your loan has been
 * approved!"), so it lives above the router.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { cn } from '../lib/utils.js';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_STYLES = {
  success: 'border-success-500/30 bg-success-50 text-success-700',
  error: 'border-danger-500/30 bg-danger-50 text-danger-700',
  warning: 'border-warning-500/30 bg-warning-50 text-warning-700',
  info: 'border-brand-500/30 bg-brand-500/15 text-brand-300',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ title, message = '', type = 'info', duration = 5000 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { id, title, message, type }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, message) => push({ title, message, type: 'success' }),
      error: (title, message) => push({ title, message, type: 'error', duration: 7000 }),
      warning: (title, message) => push({ title, message, type: 'warning' }),
      info: (title, message) => push({ title, message, type: 'info' }),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        Fixed above everything; safe-area padding keeps it clear of mobile chrome.

        Anchored bottom-right at every breakpoint. Each toast is
        `pointer-events-auto`, so wherever the stack sits it swallows clicks on
        whatever is underneath: at the top-right that was the topbar's Live
        badge, bell and profile menu, and one row down it was the primary
        action at the top of the page. The bottom corner is clear of both.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] ?? Info;
          return (
            <div
              key={toast.id}
              data-testid={TESTIDS.common.toast}
              data-toast-type={toast.type}
              role="status"
              aria-live="polite"
              className={cn(
                'pointer-events-auto flex w-full max-w-md animate-slide-in-right items-start gap-3 rounded-card border px-4 py-3 shadow-panel backdrop-blur-heavy',
                TONE_STYLES[toast.type] ?? TONE_STYLES.info
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p data-testid={TESTIDS.common.toastTitle} className="text-sm font-semibold">
                  {toast.title}
                </p>
                {toast.message ? (
                  <p className="mt-0.5 break-words text-xs opacity-90">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                data-testid={TESTIDS.common.toastClose}
                onClick={() => dismiss(toast.id)}
                className="rounded p-0.5 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
};

export default ToastContext;
