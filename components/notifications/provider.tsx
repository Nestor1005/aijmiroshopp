'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { uid } from '@/lib/id';

export type NotificationVariant = 'success' | 'error' | 'warning' | 'info';

export type Notification = {
  id: string;
  title?: string;
  message: string;
  variant?: NotificationVariant;
  duration?: number; // ms, default 4000
};

type NotificationsContextValue = {
  notify: (n: Omit<Notification, 'id'>) => string; // returns id
  close: (id: string) => void;
  clear: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function variantStyles(variant: NotificationVariant | undefined) {
  switch (variant) {
    case 'success':
      return {
        border: 'border-emerald-600/60',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-200',
        icon: (
          <svg className="h-4 w-4 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ),
      };
    case 'error':
      return {
        border: 'border-rose-600/60',
        bg: 'bg-rose-500/10',
        text: 'text-rose-200',
        icon: (
          <svg className="h-4 w-4 text-rose-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        ),
      };
    case 'warning':
      return {
        border: 'border-amber-600/60',
        bg: 'bg-amber-500/10',
        text: 'text-amber-200',
        icon: (
          <svg className="h-4 w-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        ),
      };
    default:
      return {
        border: 'border-slate-700/60',
        bg: 'bg-slate-900/70',
        text: 'text-slate-200',
        icon: (
          <svg className="h-4 w-4 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 18a9 9 0 110-18 9 9 0 010 18z" />
          </svg>
        ),
      };
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const timers = useRef<Record<string, number>>({});

  const close = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const t = timers.current[id];
    if (t) {
      window.clearTimeout(t);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback((n: Omit<Notification, 'id'>) => {
  const id = uid();
    const duration = Math.max(1200, n.duration ?? 4000);
    const item: Notification = { id, ...n };
    setItems((prev) => [item, ...prev].slice(0, 5));
    timers.current[id] = window.setTimeout(() => close(id), duration);
    return id;
  }, [close]);

  const clear = useCallback(() => {
    Object.values(timers.current).forEach((t) => window.clearTimeout(t));
    timers.current = {};
    setItems([]);
  }, []);

  const value = useMemo(() => ({ notify, close, clear }), [notify, close, clear]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
  {/* Viewport: top-right to avoid covering primary actions on mobile */}
  <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed top-0 right-0 z-[100] flex max-h-screen flex-col items-end gap-2 p-4 sm:p-6">
        {items.map((n) => {
          const v = variantStyles(n.variant);
          return (
            <div
              key={n.id}
              className={`pointer-events-auto ml-auto w-full max-w-sm rounded-2xl border ${v.border} ${v.bg} shadow-xl shadow-slate-950/40 ring-1 ring-black/5 backdrop-blur`}
              role="status"
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-1 inline-flex">{v.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? (
                    <p className="truncate text-sm font-semibold text-slate-100">{n.title}</p>
                  ) : null}
                  <p className={`mt-0.5 text-sm ${v.text}`}>{n.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => close(n.id)}
                  className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-slate-400 transition hover:border-slate-700/60 hover:text-slate-200"
                  aria-label="Cerrar notificación"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
  return ctx;
}

export function useNotify() {
  return useNotifications().notify;
}
