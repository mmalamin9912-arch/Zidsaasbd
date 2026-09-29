/**
 * Toast notification system.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard used native `window.alert()` for every confirmation and error.
 * That is a hard UX problem, not just a cosmetic one:
 *
 *   • `alert()` is BLOCKING — it freezes the whole JS thread until dismissed, so
 *     a "saved!" popup stalled the very network request that was saving.
 *   • It is modal — the merchant cannot keep working, and dismissing it steals
 *     focus from the field they were editing.
 *   • It cannot be styled, is inconsistent across browsers/OSes, and shows the
 *     page URL in some browsers.
 *   • It cannot express severity, so a destructive failure and a success looked
 *     identical.
 *
 * Toasts replace all of that: non-blocking, stackable, severity-aware, and
 * dismissible, while the async work they describe continues untouched.
 *
 * USAGE
 * -----
 *   const toast = useToast();
 *   toast.success('Brand identity saved to your storefront.');
 *   toast.error('Could not reach the database.');
 *   toast.info('Rendering preview…');
 *
 * Also exported as a standalone `toast` object so non-React modules (services,
 * helpers, catch blocks outside a component) can post notifications without
 * threading a hook through the call stack.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  duration?: number;
  /** Optional description shown beneath the title. */
  description?: string;
  /** Optional inline action button (e.g. "Undo", "Retry"). */
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (variant: ToastVariant, message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Per-variant accent colour + icon, matching the dashboard's dark palette. */
const VARIANT_STYLES: Record<ToastVariant, { accent: string; border: string; icon: React.ReactNode }> = {
  success: {
    accent: 'text-[#00D68F]',
    border: 'border-[#00D68F]/40',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  error: {
    accent: 'text-rose-400',
    border: 'border-rose-500/40',
    icon: <XCircle className="w-4 h-4" />,
  },
  warning: {
    accent: 'text-amber-400',
    border: 'border-amber-500/40',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  info: {
    accent: 'text-sky-400',
    border: 'border-sky-500/40',
    icon: <Info className="w-4 h-4" />,
  },
};

const DEFAULT_DURATION = 3500;
/** Errors linger longer — the merchant usually needs to read them fully. */
const ERROR_DURATION = 6000;

/** Errors stay until dismissed; everything else auto-expires. */
function resolveDuration(variant: ToastVariant, duration?: number): number {
  if (duration !== undefined) return duration;
  return variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
}

let idCounter = 0;
const nextId = () => `toast-${Date.now()}-${++idCounter}`;

// -----------------------------------------------------------------------------
// Standalone bridge
// -----------------------------------------------------------------------------
// A module-level emitter lets non-React code raise a toast. The provider
// subscribes on mount; before that, calls are buffered so a toast fired during
// app bootstrap is not lost.
let externalListener: ((t: ToastItem) => void) | null = null;
const pendingQueue: ToastItem[] = [];

function emitExternal(variant: ToastVariant, message: string, options?: ToastOptions) {
  const item: ToastItem = { id: nextId(), variant, message, ...options };
  if (externalListener) externalListener(item);
  else pendingQueue.push(item);
  return item.id;
}

/**
 * Imperative toast API for code that is not inside a React component.
 * Prefer the `useToast()` hook inside components.
 */
export const toast = {
  success: (message: string, options?: ToastOptions) => emitExternal('success', message, options),
  error: (message: string, options?: ToastOptions) => emitExternal('error', message, options),
  warning: (message: string, options?: ToastOptions) => emitExternal('warning', message, options),
  info: (message: string, options?: ToastOptions) => emitExternal('info', message, options),
};

// -----------------------------------------------------------------------------
// Provider + viewport
// -----------------------------------------------------------------------------

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions) => {
      const item: ToastItem = { id: nextId(), variant, message, ...options };
      // Cap the stack so a burst of failures cannot cover the whole viewport.
      setToasts((prev) => [...prev.slice(-4), item]);

      const duration = resolveDuration(variant, options?.duration);
      if (duration > 0) {
        timers.current.set(
          item.id,
          setTimeout(() => dismiss(item.id), duration)
        );
      }
      return item.id;
    },
    [dismiss]
  );

  // Bridge the standalone API into this provider, then drain anything buffered
  // before the provider mounted.
  useEffect(() => {
    externalListener = (item: ToastItem) => {
      setToasts((prev) => [...prev.slice(-4), item]);
      const duration = resolveDuration(item.variant, item.duration);
      if (duration > 0) {
        timers.current.set(
          item.id,
          setTimeout(() => {
            timers.current.delete(item.id);
            setToasts((prev) => prev.filter((t) => t.id !== item.id));
          }, duration)
        );
      }
    };
    pendingQueue.splice(0).forEach(externalListener);
    return () => {
      externalListener = null;
    };
  }, []);

  // Clear pending timers on unmount so a dismissed provider cannot fire later.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (message: string, options?: ToastOptions) => push('success', message, options),
      error: (message: string, options?: ToastOptions) => push('error', message, options),
      warning: (message: string, options?: ToastOptions) => push('warning', message, options),
      info: (message: string, options?: ToastOptions) => push('info', message, options),
    }),
    [toasts, push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

/** The visual stack. Rendered by the provider; not used directly. */
export const ToastViewport: React.FC<{ toasts: ToastItem[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed z-[200] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast: t, onDismiss }) => {
  const style = VARIANT_STYLES[t.variant];
  return (
    <div
      role={t.variant === 'error' ? 'alert' : 'status'}
      aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto w-full sm:w-[360px] bg-[#181B26]/98 backdrop-blur-xl border ${style.border} rounded-xl shadow-2xl p-3 flex items-start gap-2.5 animate-toast-in`}
    >
      <span className={`${style.accent} shrink-0 mt-0.5`}>{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white leading-snug break-words">{t.message}</p>
        {t.description && (
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1 break-words">{t.description}</p>
        )}
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action?.onClick();
              onDismiss(t.id);
            }}
            className={`mt-2 text-[11px] font-black uppercase tracking-wider ${style.accent} hover:underline cursor-pointer`}
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        className="text-slate-500 hover:text-white transition p-0.5 shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Access the toast API from a component.
 *
 * Falls back to the standalone `toast` object when no provider is mounted, so a
 * component rendered in isolation (a test, an embedded widget) still surfaces
 * its message instead of throwing.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    toasts: [],
    push: (variant, message, options) => emitExternal(variant, message, options),
    dismiss: () => {},
    success: (m, o) => emitExternal('success', m, o),
    error: (m, o) => emitExternal('error', m, o),
    warning: (m, o) => emitExternal('warning', m, o),
    info: (m, o) => emitExternal('info', m, o),
  };
}

export default ToastProvider;