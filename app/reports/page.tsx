"use client";
/* eslint-disable react-hooks/preserve-manual-memoization */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import type { Product, SalesOrder, SalesOrderPaymentMethod } from "@/lib/entities";
import { SALES_ORDER_PAYMENT_METHODS } from "@/lib/entities";
import { listOrders, listProducts, getLowStockThreshold, setLowStockThreshold } from "@/lib/supabase-repo";
import * as XLSX from "xlsx";
import { useNotify } from "@/components/notifications/provider";

type PaymentMethod = SalesOrderPaymentMethod;

const PAYMENT_METHODS = SALES_ORDER_PAYMENT_METHODS;

const COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#f87171", "#a78bfa", "#fb7185"];

const formatBs = (n: number) =>
  new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", minimumFractionDigits: 2 }).format(n ?? 0);

type DateRange = { from: string; to: string };

type Filters = {
  range: DateRange;
  quick: "today" | "7d" | "30d" | "month" | "prev-month" | "custom";
  kinds: Array<"sale" | "sales-order">;
  methods: PaymentMethod[];
  role: Array<"admin" | "operator">;
  user: string; // username exact or empty
  clientTerm: string;
  productTerm: string;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function applyQuickRange(quick: Filters["quick"], base?: DateRange): DateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const endStr = todayYMD();
  if (quick === "today") return { from: endStr, to: endStr };
  if (quick === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    const from = start.toISOString().slice(0, 10);
    return { from, to: endStr };
  }
  if (quick === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    const from = start.toISOString().slice(0, 10);
    return { from, to: endStr };
  }
  if (quick === "month") {
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    return { from, to: endStr };
  }
  if (quick === "prev-month") {
    const start = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { from: start.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }
  return base ?? { from: "", to: "" };
}

// Cloud data loaders
async function fetchOrders(): Promise<SalesOrder[]> {
  const rows = await listOrders();
  return rows.map((o) => {
    const pmRaw = String(o.payment_method ?? "");
    const pm: PaymentMethod = (PAYMENT_METHODS as readonly string[]).includes(pmRaw)
      ? (pmRaw as PaymentMethod)
      : "Otro";
    return ({
    id: o.id,
    kind: o.kind,
    performedByUsername: o.performed_by_username ?? "",
    performedByRole: o.performed_by_role ?? undefined,
    clientId: o.client_id ?? "",
    clientName: o.client_name ?? "",
    clientDocumentId: o.client_document_id ?? "",
    clientPhone: o.client_phone ?? "",
    deliveryAddress: o.delivery_address ?? "",
    paymentMethod: pm,
    sequence: o.sequence,
    subtotal: Number(o.subtotal ?? 0),
    discount: Number(o.discount ?? 0),
    total: Number(o.total ?? 0),
    notes: o.notes ?? "",
    createdAt: o.created_at ?? new Date().toISOString(),
    items: (o.items ?? []).map((it) => ({
      productId: String(it.product_id ?? ""),
      productName: String(it.product_name ?? ""),
      color: String(it.color ?? ""),
      quantity: Number(it.qty ?? 0),
      unitPrice: Number(it.unit_price ?? 0),
      lineTotal: Number(it.subtotal ?? 0),
    })),
    });
  });
}

function dateInRange(iso: string, range: DateRange) {
  if (!range.from && !range.to) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (range.from) {
    const f = new Date(`${range.from}T00:00:00`).getTime();
    if (t < f) return false;
  }
  if (range.to) {
    const toEnd = new Date(`${range.to}T23:59:59.999`).getTime();
    if (t > toEnd) return false;
  }
  return true;
}

export default function ReportsPage() {
  const { user, isHydrated } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const reload = async () => {
    try {
      const [o, p] = await Promise.all([fetchOrders(), listProducts()]);
      setOrders(o);
      setProducts(
        p.map((prod) => ({
          id: prod.id,
          name: prod.name,
          color: prod.color,
          stock: prod.stock,
          cost: prod.cost,
          salePrice: prod.salePrice,
          image: prod.image,
          createdAt: prod.createdAt,
        }))
      );
    } catch {
      setOrders([]);
      setProducts([]);
    }
  };
  const unauthorizedMessage = !isHydrated || !user ? "Validando permisos..." : user.role !== "admin" ? "Acceso solo para administradores." : null;
  const notify = useNotify();

  const [filters, setFilters] = useState<Filters>({
    range: applyQuickRange("30d"),
    quick: "30d",
    kinds: ["sale", "sales-order"],
    methods: [],
    role: [],
    user: "",
    clientTerm: "",
    productTerm: "",
  });

  const QUICK_OPTIONS: Filters["quick"][] = ["today", "7d", "30d", "month", "prev-month"];
  const KIND_OPTIONS: Array<"sale" | "sales-order"> = ["sale", "sales-order"];
  const ROLE_OPTIONS: Array<"admin" | "operator"> = ["admin", "operator"];

  const setQuick = (q: Filters["quick"]) => {
    setFilters((f) => ({ ...f, quick: q, range: applyQuickRange(q, f.range) }));
  };

  // Umbral configurable de stock bajo
  const [lowStockThreshold, setLowStockThresholdState] = useState<number>(5);

  useEffect(() => {
    (async () => {
      await reload();
      try {
        const n = await getLowStockThreshold();
        setLowStockThresholdState(n);
      } catch {}
    })();
  }, []);

  const updateLowStockThreshold = async (n: number) => {
    const val = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    setLowStockThresholdState(val);
    try {
      await setLowStockThreshold(val);
    } catch {}
  };

  const filtered = useMemo(() => {
    const { range, kinds, methods, role, user: username, clientTerm, productTerm } = filters;
    const ct = clientTerm.trim().toLowerCase();
    const pt = productTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (!dateInRange(o.createdAt, range)) return false;
      if (kinds.length && !kinds.includes(o.kind ?? "sales-order")) return false;
      if (methods.length && !methods.includes(o.paymentMethod as PaymentMethod)) return false;
      if (role.length && (!o.performedByRole || !role.includes(o.performedByRole))) return false;
      if (username && o.performedByUsername !== username) return false;
      if (ct) {
        const needle = `${o.clientName} ${o.clientDocumentId}`.toLowerCase();
        if (!needle.includes(ct)) return false;
      }
      if (pt) {
        const any = o.items.some((it) => `${it.productName} ${it.color}`.toLowerCase().includes(pt));
        if (!any) return false;
      }
      return true;
    });
  }, [orders, filters]);

  // KPIs
  const sales = filtered.filter((o) => o.kind === "sale");
  const saleAmount = sales.reduce((s, o) => s + (o.total ?? 0), 0);
  const saleCount = sales.length;
  const avgTicket = saleCount ? saleAmount / saleCount : 0;
  const ordersOnly = filtered.filter((o) => (o.kind ?? "sales-order") === "sales-order");
  const pendingOrders = ordersOnly.length;
  const conversion = pendingOrders ? (saleCount / pendingOrders) * 100 : saleCount > 0 ? 100 : 0;

  // Serie temporal diaria (ventas)
  const series = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of sales) {
      const day = o.createdAt.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + (o.total ?? 0));
    }
    return Array.from(map.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [sales]);

  // Distribución por método de pago (ventas)
  const methodDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of sales) map.set(o.paymentMethod, (map.get(o.paymentMethod) ?? 0) + (o.total ?? 0));
    return PAYMENT_METHODS.map((m) => ({ name: m, value: map.get(m) ?? 0 })).filter((x) => x.value > 0);
  }, [sales]);

  // Top productos (ventas)
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qty: number }>();
    for (const o of sales) {
      for (const it of o.items) {
        const key = it.productId;
        const cur = map.get(key) ?? { name: `${it.productName} (${it.color})`, total: 0, qty: 0 };
        cur.total += it.lineTotal;
        cur.qty += it.quantity;
        map.set(key, cur);
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [sales]);

  // Top clientes (ventas)
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const o of sales) {
      const key = o.clientId;
      const name = o.clientName;
      map.set(key, { name, total: (map.get(key)?.total ?? 0) + (o.total ?? 0) });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [sales]);

  // Stock bajo (configurable)
  const lowStock = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= (lowStockThreshold ?? 0)).slice(0, 10),
    [products, lowStockThreshold]
  );

  const exportDetailXlsx = () => {
    const rows = filtered.map((o) => ({
      Fecha: new Date(o.createdAt).toLocaleString("es-BO"),
      Tipo: o.kind === "sale" ? "Venta" : "Orden",
      Numero: typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "-",
      Cliente: o.clientName,
      CI: o.clientDocumentId,
      Metodo: o.paymentMethod,
      Total: o.total,
      AtendidoPor: o.performedByUsername ?? "",
      Rol: o.performedByRole ?? "",
      Notas: o.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle");
    XLSX.writeFile(wb, `reporte-detalle.xlsx`);
    try {
      notify({ title: "Exportación lista", message: "Detalle exportado a XLSX.", variant: "success" });
    } catch {}
  };

  const exportSummaryXlsx = () => {
    const wb = XLSX.utils.book_new();
    // KPIs
    const kpiRows = [
      { KPI: "Ventas (Bs)", Valor: saleAmount },
      { KPI: "Cant. Ventas", Valor: saleCount },
      { KPI: "Ticket Promedio", Valor: avgTicket },
      { KPI: "Órdenes pendientes", Valor: pendingOrders },
      { KPI: "Conversión %", Valor: conversion },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), "KPIs");

    // Serie
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(series), "Serie");
    // Métodos
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(methodDist), "MetodosPago");
    // Top productos y clientes
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topProducts), "TopProductos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topClients), "TopClientes");

    XLSX.writeFile(wb, `reporte-resumen.xlsx`);
    try {
      notify({ title: "Exportación lista", message: "Resumen exportado a XLSX.", variant: "success" });
    } catch {}
  };

  const exportDetailCsv = () => {
    const headers = [
      "Fecha",
      "Tipo",
      "Numero",
      "Cliente",
      "CI",
      "Metodo",
      "Total",
      "AtendidoPor",
      "Rol",
      "Notas",
    ];
    const lines = filtered.map((o) => [
      new Date(o.createdAt).toLocaleString("es-BO"),
      o.kind === "sale" ? "Venta" : "Orden",
      typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "-",
      o.clientName,
      o.clientDocumentId,
      o.paymentMethod,
      String(o.total ?? 0),
      o.performedByUsername ?? "",
      o.performedByRole ?? "",
      (o.notes ?? "").replaceAll("\n", " "),
    ]);
    const csv = [headers, ...lines].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reporte-detalle.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    try {
      notify({ title: "Exportación lista", message: "Detalle exportado a CSV.", variant: "success" });
    } catch {}
  };

  return (
    unauthorizedMessage ? (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">{unauthorizedMessage}</main>
    ) : (
  <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-10 sm:gap-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Reportes</p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Análisis y exportaciones</h1>
          <p className="max-w-2xl text-sm text-slate-300">Filtra por período, tipo, método y responsable para ver métricas y exportar.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
        >
          Volver al dashboard
        </Link>
      </header>

      {/* Filtros */}
      <section className="space-y-4 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Rango rápido</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_OPTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuick(q)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    filters.quick === q
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                      : "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-sky-500/50"
                  }`}
                >
                  {q === "today" ? "Hoy" : q === "7d" ? "7 días" : q === "30d" ? "30 días" : q === "month" ? "Mes actual" : "Mes anterior"}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Desde</span>
            <input
              type="date"
              value={filters.range.from}
              onChange={(e) => setFilters((f) => ({ ...f, quick: "custom", range: { ...f.range, from: e.target.value } }))}
              max={filters.range.to || undefined}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Hasta</span>
            <input
              type="date"
              value={filters.range.to}
              onChange={(e) => setFilters((f) => ({ ...f, quick: "custom", range: { ...f.range, to: e.target.value } }))}
              min={filters.range.from || undefined}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Tipo</span>
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      kinds: f.kinds.includes(k)
                        ? f.kinds.filter((x) => x !== k)
                        : [...f.kinds, k],
                    }))
                  }
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    filters.kinds.includes(k)
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                      : "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-sky-500/50"
                  }`}
                >
                  {k === "sale" ? "Ventas" : "Órdenes"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Métodos</span>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      methods: f.methods.includes(m)
                        ? f.methods.filter((x) => x !== m)
                        : [...f.methods, m],
                    }))
                  }
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    filters.methods.includes(m)
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                      : "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-sky-500/50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Rol</span>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      role: f.role.includes(r) ? f.role.filter((x) => x !== r) : [...f.role, r],
                    }))
                  }
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    filters.role.includes(r)
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                      : "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-sky-500/50"
                  }`}
                >
                  {r === "admin" ? "Administrador" : "Operador"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Usuario</span>
            <input
              value={filters.user}
              onChange={(e) => setFilters((f) => ({ ...f, user: e.target.value }))}
              placeholder="username exacto"
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Cliente</span>
            <input
              value={filters.clientTerm}
              onChange={(e) => setFilters((f) => ({ ...f, clientTerm: e.target.value }))}
              placeholder="Nombre o CI"
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Producto</span>
            <input
              value={filters.productTerm}
              onChange={(e) => setFilters((f) => ({ ...f, productTerm: e.target.value }))}
              placeholder="Nombre o color"
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={reload}
              className="rounded-lg border border-slate-700/60 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Refrescar
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters({
                  range: applyQuickRange("30d"),
                  quick: "30d",
                  kinds: ["sale", "sales-order"],
                  methods: [],
                  role: [],
                  user: "",
                  clientTerm: "",
                  productTerm: "",
                })
              }
              className="rounded-lg border border-slate-700/60 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[{ title: "Ventas (Bs)", value: formatBs(saleAmount) },
          { title: "Cant. Ventas", value: saleCount.toString() },
          { title: "Ticket Prom.", value: formatBs(avgTicket) },
          { title: "Conversión", value: `${conversion.toFixed(1)}%` }].map((k) => (
          <div key={k.title} className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{k.title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{k.value}</p>
          </div>
        ))}
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Ventas por día</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#0f172a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: unknown) => formatBs(typeof v === "number" ? v : Number(v ?? 0))} labelFormatter={(l) => l} />
                <Line type="monotone" dataKey="total" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Métodos de pago</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={methodDist} dataKey="value" nameKey="name" outerRadius={90} innerRadius={40}>
                  {methodDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatBs(typeof v === "number" ? v : Number(v ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Top productos</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#0f172a" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round((v as number) / 1000)}k`} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" width={180} stroke="#94a3b8" />
                <Tooltip formatter={(v: unknown) => formatBs(typeof v === "number" ? v : Number(v ?? 0))} />
                <Bar dataKey="total" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Top clientes</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClients} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#0f172a" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round((v as number) / 1000)}k`} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" width={180} stroke="#94a3b8" />
                <Tooltip formatter={(v: unknown) => formatBs(typeof v === "number" ? v : Number(v ?? 0))} />
                <Bar dataKey="total" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Stock bajo y export */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Stock bajo (≤{lowStockThreshold})</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Umbral:</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={lowStockThreshold}
                  onChange={(e) => updateLowStockThreshold(Number(e.target.value))}
                  className="w-20 rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
              <Link href="/inventory" className="text-xs text-sky-300 underline underline-offset-4">Ir a Inventario</Link>
            </div>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400">Sin productos con stock bajo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead>
                  <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-4">Producto</th>
                    <th className="py-2 pr-4">Color</th>
                    <th className="py-2 pr-4">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lowStock.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4">{p.color}</td>
                      <td className="py-2 pr-4">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Exportaciones</h2>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={exportDetailXlsx}
              className="rounded-xl border border-sky-500/70 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20"
            >
              Exportar Detalle (XLSX)
            </button>
            <button
              type="button"
              onClick={exportDetailCsv}
              className="rounded-xl border border-slate-700/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Exportar Detalle (CSV)
            </button>
            <button
              type="button"
              onClick={exportSummaryXlsx}
              className="rounded-xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Exportar Resumen (XLSX)
            </button>
          </div>
        </div>
      </section>
    </main>
    )
  );
}
