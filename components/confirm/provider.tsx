'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string; // default: Aceptar
  cancelText?: string; // default: Cancelar
  intent?: 'default' | 'danger';
};

type Resolver = (result: boolean) => void;

type ConfirmContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOpts(next);
      setResolver(() => resolve);
      setOpen(true);
    });
  }, []);

  const resolve = useCallback((value: boolean) => {
    const r = resolver;
    setOpen(false);
    setResolver(null);
    if (r) r(value);
  }, [resolver]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const intent = opts?.intent ?? 'default';
  const border = intent === 'danger' ? 'border-rose-600/60' : 'border-slate-700/60';
  const headerText = 'text-slate-100';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {open && opts ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4">
          <div
            className={`w-full max-w-md rounded-2xl border ${border} bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/50 backdrop-blur`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                {opts.title ? (
                  <h2 id="confirm-title" className={`text-base font-semibold ${headerText}`}>
                    {opts.title}
                  </h2>
                ) : null}
                <p id="confirm-desc" className="text-sm text-slate-300">{opts.message}</p>
              </div>
              <button
                type="button"
                onClick={() => resolve(false)}
                className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500/70 hover:text-sky-200"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resolve(false)}
                className="rounded-lg border border-slate-700/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
              >
                {opts.cancelText ?? 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => resolve(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg transition ${
                  intent === 'danger'
                    ? 'border border-rose-600/60 bg-rose-600/90 hover:bg-rose-600'
                    : 'border border-sky-600/60 bg-sky-600/90 hover:bg-sky-600'
                }`}
              >
                {opts.confirmText ?? 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx.confirm;
}
