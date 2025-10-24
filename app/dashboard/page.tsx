'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getRoleLabel, useAuth, type Role } from "@/lib/auth-context";
import { formatBs } from "@/lib/currency";
import { listOrders, listProducts, getLowStockThreshold } from "@/lib/supabase-repo";

type ModuleDefinition = {
  id: string;
  title: string;
  description: string;
  roles: Role[];
  accent: string;
  status: "Disponible" | "En planificación";
  href?: string;
};

const MODULES: ModuleDefinition[] = [
  {
    id: "inventory",
    title: "Inventario",
    description:
      "Supervisa existencias, lotes y alertas de productos críticos en tiempo real.",
    roles: ["admin"],
    accent: "from-emerald-400 via-emerald-500 to-teal-500",
    status: "Disponible",
    href: "/inventory",
  },
  {
    id: "customers",
    title: "Clientes",
    description:
      "Centraliza perfiles, historial de compras y preferencias para campañas personalizadas.",
    roles: ["admin"],
    accent: "from-sky-400 via-blue-500 to-indigo-500",
    status: "Disponible",
    href: "/clients",
  },
  {
    id: "sales-orders",
    title: "Orden de Venta",
    description:
      "Crea órdenes ágiles con seguimiento del estado y disponibilidad del inventario.",
    roles: ["admin", "operator"],
    accent: "from-blue-500 via-indigo-500 to-purple-500",
    status: "Disponible",
    href: "/sales-orders",
  },
  {
    id: "register-sale",
    title: "Registrar Venta",
    description:
      "Registra transacciones rápidas con cálculo de totales y comprobantes listos para el cliente.",
    roles: ["admin", "operator"],
    accent: "from-amber-400 via-orange-500 to-rose-500",
    status: "Disponible",
    href: "/register-sale",
  },
  {
    id: "history",
    title: "Historial",
    description:
      "Consulta el detalle de operaciones, filtros avanzados y exportación para auditorías.",
    roles: ["admin", "operator"],
    accent: "from-fuchsia-500 via-purple-500 to-sky-500",
    status: "Disponible",
    href: "/history",
  },
  {
    id: "reports",
    title: "Reportes",
    description:
      "Monitorea métricas clave con dashboards configurables y alertas automatizadas.",
    roles: ["admin"],
    accent: "from-violet-500 via-purple-500 to-pink-500",
    status: "Disponible",
    href: "/reports",
  },
  {
    id: "settings",
    title: "Ajustes",
    description:
      "Administra roles, permisos, integraciones (Supabase) y configuración de la cuenta.",
    roles: ["admin"],
    accent: "from-slate-500 via-slate-600 to-slate-700",
    status: "Disponible",
    href: "/settings",
  },
];

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Stat = { label: string; value: string; hint: string };

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, isHydrated } = useAuth();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [stats, setStats] = useState<Stat[]>([
    { label: "Ventas del día", value: formatBs(0), hint: "Datos de Supabase" },
    { label: "Inventario crítico", value: "0 ítems", hint: "Umbral configurable" },
    { label: "Clientes activos", value: "0", hint: "Últimos 30 días" },
  ]);

  const computeStats = async () => {
    try {
      const [orders, products, threshold] = await Promise.all([
        listOrders(),
        listProducts(),
        getLowStockThreshold(),
      ]);

      const today = todayYMD();
      const salesToday = orders.filter(
        (o) => o.kind === "sale" && typeof o.created_at === "string" && o.created_at.slice(0, 10) === today,
      );
      const totalToday = salesToday.reduce((s, o) => s + (Number(o.total) || 0), 0);

      const critical = products.filter((p) => (Number(p?.stock) || 0) <= threshold).length;

      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      const activeSet = new Set<string>();
      orders.forEach((o) => {
        if (o.kind !== "sale" || !o.created_at) return;
        const t = new Date(o.created_at).getTime();
        if (!Number.isFinite(t) || t < start.getTime()) return;
        if (o.client_id) activeSet.add(String(o.client_id));
      });
      const activeClients = activeSet.size;

      setStats([
        { label: "Ventas del día", value: formatBs(totalToday), hint: "Datos de Supabase" },
        { label: "Inventario crítico", value: `${critical} ítems`, hint: `Umbral ${threshold}` },
        { label: "Clientes activos", value: String(activeClients), hint: "Últimos 30 días" },
      ]);
    } catch {
      // leave defaults
    }
  };

  // Oculta la tarjeta de "Integración pendiente" si ya existen variables NEXT_PUBLIC_SUPABASE_*
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (isHydrated && !user) {
      router.replace("/");
    }
  }, [isHydrated, user, router]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void computeStats();
    };
    // Defer setState out of effect body to avoid cascading renders warning
    setTimeout(() => {
      void computeStats();
    }, 0);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const availableModules = useMemo(
    () => (user ? MODULES.filter((module) => module.roles.includes(user.role)) : []),
    [user],
  );

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (!user) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">
        Redirigiendo al inicio...
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-10 sm:gap-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur md:flex-row md:items-center md:justify-between md:p-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
            Panel {getRoleLabel(user.role)}
          </p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">
            Hola {user.username}, gestionemos AIJMIROSHOP.
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Accede a los módulos habilitados para tu rol. La interfaz está pensada para flujos rápidos en computadora y móviles.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-500/70 hover:bg-rose-500/10 hover:text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
        >
          Cerrar sesión
        </button>
      </header>

      <section className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/30 backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">Módulos disponibles</h2>
          <button
            type="button"
            onClick={() => setIsNavOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40 md:hidden"
            aria-expanded={isNavOpen}
          >
            {isNavOpen ? "Cerrar menú" : "Abrir menú"}
          </button>
        </div>
        <nav
          className={`grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 ${
            isNavOpen ? "" : "hidden md:grid"
          }`}
        >
          {availableModules.map((module) => {
            const isActive = Boolean(module.href);

            if (isActive && module.href) {
              return (
                <Link
                  key={module.id}
                  href={module.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:border-sky-500/70 hover:bg-slate-900/60"
                >
                  {module.title}
                  <span className="text-[10px] uppercase text-slate-500">
                    {module.status}
                  </span>
                </Link>
              );
            }

            return (
              <span
                key={module.id}
                className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/20 px-3 py-2 text-left text-xs font-medium text-slate-500"
                aria-disabled
              >
                {module.title}
                <span className="text-[10px] uppercase text-slate-500">
                  {module.status}
                </span>
              </span>
            );
          })}
        </nav>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {availableModules.map((module) => {
              const isActive = Boolean(module.href);

              return (
                <article
                  key={module.id}
                  className="flex h-full flex-col justify-between rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6 shadow-lg shadow-slate-950/40 transition hover:border-sky-500/70"
                >
                  <div className="space-y-4">
                    <span
                      className={`inline-flex w-fit items-center rounded-full bg-gradient-to-r ${module.accent} px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-50`}
                    >
                      {module.status}
                    </span>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-slate-100">
                        {module.title}
                      </h3>
                      <p className="text-sm text-slate-300">{module.description}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Rol permitido: {module.roles.length === 2
                        ? "Admin y Operador"
                        : getRoleLabel(module.roles[0])}
                    </span>
                    {isActive ? (
                      <Link
                        href={module.href as string}
                        className="rounded-full border border-sky-500/70 bg-sky-500/10 px-3 py-1 font-semibold text-sky-200 transition hover:bg-sky-500/20"
                      >
                        Ir al módulo
                      </Link>
                    ) : (
                      <span className="rounded-full border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                        Próximamente
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
            <h2 className="text-lg font-semibold text-slate-100">Indicadores rápidos</h2>
            <p className="text-sm text-slate-400">
              Datos de muestra listos para conectar con Supabase y dashboards en Vercel.
            </p>
            <div className="mt-5 space-y-4">
              {stats.map((item: Stat) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-800/60 bg-slate-950/60 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="text-2xl font-semibold text-slate-100">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {!hasSupabaseEnv && (
            <div className="rounded-3xl border border-slate-800/70 bg-gradient-to-br from-sky-500/20 via-blue-500/10 to-transparent p-6 shadow-lg shadow-slate-950/40">
              <h2 className="text-lg font-semibold text-slate-100">Integración pendiente</h2>
              <p className="mt-2 text-sm text-slate-200">
                Configura las variables <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para conectar el sistema a Supabase.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/70 px-4 py-2 text-xs font-medium text-slate-200 opacity-60"
                disabled
              >
                Ver guía (muy pronto)
              </button>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
