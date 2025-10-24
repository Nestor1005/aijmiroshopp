"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_TICKETS_CONFIG,
  DEFAULT_USERS_CONFIG,
  getTicketsConfig,
  getUsersConfig,
  saveTicketsConfig,
  saveUsersConfig,
  type OperatorUser,
  type TicketsConfig,
  type UsersConfig,
} from "@/lib/settings";
import { uid } from "@/lib/id";

export default function SettingsPage() {
  const { user, isHydrated } = useAuth();
  const unauthorizedMessage = !isHydrated || !user ? "Validando permisos..." : user.role !== "admin" ? "Acceso solo para administradores." : null;

  const [usersCfg, setUsersCfg] = useState<UsersConfig>(getUsersConfig());
  const [ticketsCfg, setTicketsCfg] = useState<TicketsConfig>(getTicketsConfig());

  // Derived previews
  const sampleSaleNumber = useMemo(() => String(ticketsCfg.sale.nextNumber).padStart(6, "0"), [ticketsCfg.sale.nextNumber]);
  const sampleOrderNumber = useMemo(() => String(ticketsCfg.order.nextNumber).padStart(6, "0"), [ticketsCfg.order.nextNumber]);

  // Users handlers
  const updateAdminField = (key: "username" | "password", val: string) => {
    const next = { ...usersCfg, admin: { ...usersCfg.admin, [key]: val } };
    setUsersCfg(next);
    saveUsersConfig(next);
  };

  const addOperator = () => {
    const next: OperatorUser = { id: uid(), username: "", password: "", active: true };
    const cfg = { ...usersCfg, operators: [next, ...usersCfg.operators] };
    setUsersCfg(cfg);
    saveUsersConfig(cfg);
  };

  const updateOperator = (id: string, patch: Partial<OperatorUser>) => {
    const ops = usersCfg.operators.map((o) => (o.id === id ? { ...o, ...patch } : o));
    const cfg = { ...usersCfg, operators: ops };
    setUsersCfg(cfg);
    saveUsersConfig(cfg);
  };

  const removeOperator = (id: string) => {
    const ops = usersCfg.operators.filter((o) => o.id !== id);
    const cfg = { ...usersCfg, operators: ops };
    setUsersCfg(cfg);
    saveUsersConfig(cfg);
  };

  const resetUsers = () => {
    const cfg = { ...DEFAULT_USERS_CONFIG, operators: [...DEFAULT_USERS_CONFIG.operators] };
    setUsersCfg(cfg);
    saveUsersConfig(cfg);
  };

  // Tickets handlers
  const updateTickets = (patch: Partial<TicketsConfig>) => {
    const cfg = { ...ticketsCfg, ...patch } as TicketsConfig;
    setTicketsCfg(cfg);
    saveTicketsConfig(cfg);
  };

  const updateTicketSide = (
    side: "sale" | "order",
    patch: Partial<TicketsConfig["sale"]>,
  ) => {
    const cfg = { ...ticketsCfg, [side]: { ...ticketsCfg[side], ...patch } } as TicketsConfig;
    setTicketsCfg(cfg);
    saveTicketsConfig(cfg);
  };

  const resetTickets = () => {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_TICKETS_CONFIG)) as TicketsConfig;
    setTicketsCfg(cfg);
    saveTicketsConfig(cfg);
  };

  return (
    unauthorizedMessage ? (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">{unauthorizedMessage}</main>
    ) : (
  <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-10 sm:gap-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Ajustes</p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Configuración del sistema</h1>
          <p className="max-w-2xl text-sm text-slate-300">Administra usuarios y personaliza los tickets de Orden de Venta y Registro de Venta.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
        >
          Volver al dashboard
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Cuenta Administrador</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Usuario</span>
              <input
                value={usersCfg.admin.username}
                onChange={(e) => updateAdminField("username", e.target.value)}
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Contraseña</span>
              <input
                type="password"
                value={usersCfg.admin.password}
                onChange={(e) => updateAdminField("password", e.target.value)}
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={resetUsers}
              className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-rose-500/70 hover:text-rose-200"
            >
              Restaurar credenciales por defecto
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Operadores</h2>
            <button
              type="button"
              onClick={addOperator}
              className="rounded-xl border border-sky-500/70 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
            >
              Agregar operador
            </button>
          </div>
          <div className="space-y-2">
            {usersCfg.operators.length === 0 ? (
              <p className="text-sm text-slate-400">No hay operadores. Agrega uno para permitir acceso como rol Operador.</p>
            ) : (
              <div className="space-y-3">
                {usersCfg.operators.map((op) => (
                  <div key={op.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-3 sm:flex-row sm:items-end sm:gap-4">
                    <label className="flex-1 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Usuario</span>
                      <input
                        value={op.username}
                        onChange={(e) => updateOperator(op.id, { username: e.target.value })}
                        className="w-full rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="flex-1 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Contraseña</span>
                      <input
                        type="password"
                        value={op.password}
                        onChange={(e) => updateOperator(op.id, { password: e.target.value })}
                        className="w-full rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={op.active}
                        onChange={(e) => updateOperator(op.id, { active: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-700/60 bg-slate-950/60 text-sky-500"
                      />
                      Activo
                    </label>
                    <button
                      type="button"
                      onClick={() => removeOperator(op.id)}
                      className="self-start rounded-lg border border-rose-600/50 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Configuración de Tickets</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Nombre de la empresa</span>
              <input
                value={ticketsCfg.companyName}
                onChange={(e) => updateTickets({ companyName: e.target.value })}
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Subtítulo</span>
              <input
                value={ticketsCfg.subtitle}
                onChange={(e) => updateTickets({ subtitle: e.target.value })}
                className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Ticket de Venta</h3>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Próximo número</span>
                <input
                  type="number"
                  min={1}
                  value={ticketsCfg.sale.nextNumber}
                  onChange={(e) => updateTicketSide("sale", { nextNumber: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-40 rounded-lg border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Mensaje de despedida</span>
                <input
                  value={ticketsCfg.sale.farewell}
                  onChange={(e) => updateTicketSide("sale", { farewell: e.target.value })}
                  className="w-full rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Ticket de Orden de Venta</h3>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Próximo número</span>
                <input
                  type="number"
                  min={1}
                  value={ticketsCfg.order.nextNumber}
                  onChange={(e) => updateTicketSide("order", { nextNumber: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-40 rounded-lg border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Mensaje de despedida</span>
                <input
                  value={ticketsCfg.order.farewell}
                  onChange={(e) => updateTicketSide("order", { farewell: e.target.value })}
                  className="w-full rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={resetTickets}
              className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-rose-500/70 hover:text-rose-200"
            >
              Restaurar ticket por defecto
            </button>
          </div>
        </div>

        {/* Vista previa simple */}
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Vista previa</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/60 bg-white p-4 text-slate-900">
              <p className="text-center text-lg font-bold">{ticketsCfg.companyName || "Empresa"}</p>
              <p className="text-center text-xs text-slate-600">{ticketsCfg.subtitle || "Subtítulo"}</p>
              <p className="mt-2 text-center text-sm font-semibold">Venta #{sampleSaleNumber}</p>
              <p className="mt-2 text-center text-xs text-slate-600">{ticketsCfg.sale.farewell}</p>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-white p-4 text-slate-900">
              <p className="text-center text-lg font-bold">{ticketsCfg.companyName || "Empresa"}</p>
              <p className="text-center text-xs text-slate-600">{ticketsCfg.subtitle || "Subtítulo"}</p>
              <p className="mt-2 text-center text-sm font-semibold">Orden de Venta #{sampleOrderNumber}</p>
              <p className="mt-2 text-center text-xs text-slate-600">{ticketsCfg.order.farewell}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">La descarga real sigue usando un formato gráfico; esta vista previa es representativa del texto configurado.</p>
        </div>
      </section>
    </main>
    )
  );
}
