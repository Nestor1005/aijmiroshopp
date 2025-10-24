"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SALES_ORDER_PAYMENT_METHODS, SalesOrder, SalesOrderPaymentMethod } from "@/lib/entities";
import { useConfirm } from "@/components/confirm/provider";
import { useNotify } from "@/components/notifications/provider";
import { listOrders, listProducts, deleteOrder as deleteOrderRemote, clearOrders as clearOrdersRemote } from "@/lib/supabase-repo";
import type { OrderItem as DbOrderItem } from "@/lib/supabase-repo";
import { getTicketsConfigRemote } from "@/lib/supabase-repo";
import { DEFAULT_TICKETS_CONFIG, type TicketsConfig } from "@/lib/settings";

const PAYMENT_METHODS = SALES_ORDER_PAYMENT_METHODS;

type DateRange = {
  from: string; // yyyy-mm-dd or ""
  to: string; // yyyy-mm-dd or ""
};

function useCloudHistory() {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});

  const load = async () => {
    try {
      const [orders, products] = await Promise.all([listOrders(), listProducts()]);
      const map: Record<string, number> = {};
      for (const p of products) map[p.id] = p.stock;
      setInventoryMap(map);

      // Map DB orders to UI SalesOrder type
      const uiOrders: SalesOrder[] = (orders ?? []).map((o) => ({
        id: o.id,
        kind: o.kind,
        performedByUsername: o.performed_by_username ?? undefined,
        performedByRole: o.performed_by_role === "admin" || o.performed_by_role === "operator" ? o.performed_by_role : undefined,
        clientId: o.client_id ?? "",
        clientName: o.client_name ?? "",
        clientDocumentId: o.client_document_id ?? "",
        clientPhone: o.client_phone ?? "",
        deliveryAddress: o.delivery_address ?? "",
        paymentMethod: (o.payment_method as SalesOrderPaymentMethod) ?? "Efectivo",
        sequence: o.sequence,
        subtotal: Number(o.subtotal ?? 0),
        discount: Number(o.discount ?? 0),
        total: Number(o.total ?? 0),
        notes: o.notes ?? "",
        createdAt: o.created_at ?? new Date().toISOString(),
        items: (o.items ?? []).map((it) => {
          const row = it as DbOrderItem;
          return {
            productId: row.product_id ?? "",
            productName: row.product_name ?? "",
            color: row.color ?? "",
            quantity: Number(row.qty ?? 0),
            unitPrice: Number(row.unit_price ?? 0),
            lineTotal: Number(row.subtotal ?? 0),
          };
        }),
      }));
      setData(uiOrders);
    } catch (e) {
      console.error("No se pudo cargar el historial desde la nube", e);
      setData([]);
      setInventoryMap({});
    }
  };

  const clear = async () => {
    await clearOrdersRemote();
    await load();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  return { data, inventoryMap, reload: load, clear };
}

const dateToYMD = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const inRange = (createdAt: string, range: DateRange) => {
  if (!range.from && !range.to) return true;
  const t = new Date(createdAt).getTime();
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
};

// Formateador de moneda en bolivianos
const formatBs = (n: number) =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 2,
  }).format(n ?? 0);

export default function HistoryPage() {
  const { user, isHydrated } = useAuth();
  const { data, inventoryMap, reload, clear } = useCloudHistory();
  const isAdmin = user?.role === "admin";
  const confirm = useConfirm();
  const notify = useNotify();

  const [term, setTerm] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [methods, setMethods] = useState<string[]>([]); // empty = all
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [detail, setDetail] = useState<SalesOrder | null>(null);

  // Nota: evitamos setState dentro de efectos por regla de lint.
  // El número de página se normaliza más abajo con "current" en base a totalPages.

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.filter((o) => {
      if (!inRange(o.createdAt, range)) return false;
      if (methods.length > 0 && !methods.includes(o.paymentMethod)) return false;
      if (!q) return true;
      const seq = typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "";
      const kindText = o.kind === "sale" ? "venta" : "orden";
      const haystack = [
        o.clientName,
        o.clientDocumentId,
        o.paymentMethod,
        o.notes ?? "",
        kindText,
        seq,
        ...o.items.map((i) => i.productName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, term, range, methods]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = filtered.slice(start, end);

  const toggleMethod = (m: string) => {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const handleClear = async () => {
    if (!isAdmin) {
      setFeedback("Solo administradores pueden vaciar el historial.");
      return;
    }
    if (data.length === 0) return;
    const ok = await confirm({
      title: "Vaciar historial",
      message: "¿Vaciar todo el historial? Esta acción no se puede deshacer.",
      confirmText: "Vaciar",
      cancelText: "Cancelar",
      intent: "danger",
    });
    if (ok) clear();
    if (ok) {
      try { notify({ title: "Historial vaciado", message: "Se eliminaron todos los registros.", variant: "success" }); } catch {}
    }
  };

  const deleteOne = async (id: string) => {
    if (!isAdmin) {
      setFeedback("Solo administradores pueden eliminar registros.");
      return;
    }
    const ok = await confirm({
      title: "Eliminar registro",
      message: "¿Eliminar este registro? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      intent: "danger",
    });
    if (!ok) return;
    try {
      await deleteOrderRemote(id);
      setFeedback("Registro eliminado en la nube.");
      try { notify({ title: "Registro eliminado", message: "Se eliminó un registro del historial en la nube.", variant: "success" }); } catch {}
      await reload();
    } catch {
      setFeedback("No se pudo eliminar el registro en la nube.");
      try { notify({ title: "Error", message: "No se pudo eliminar el registro en la nube.", variant: "error" }); } catch {}
    }
  };

  // Ticket rendering (PNG) for both Ventas and Órdenes de Venta
  const ticketDateFormatter = new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    font: string,
    maxWidth: number,
  ): string[] => {
    ctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let currentLine = words.shift() ?? "";
    words.forEach((word) => {
      const tentative = `${currentLine} ${word}`;
      if (ctx.measureText(tentative).width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = tentative;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const handleDownload = async (o: SalesOrder) => {
    try {
      const cfg = (await getTicketsConfigRemote<TicketsConfig>()) ?? DEFAULT_TICKETS_CONFIG;
      const isSale = o.kind === "sale";
      const baseFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      const styles = {
        title: { font: `700 20px ${baseFontFamily}`, color: "#111827", lineHeight: 28 },
        subtitle: { font: `400 11px ${baseFontFamily}`, color: "#6b7280", lineHeight: 18 },
        section: { font: `700 13px ${baseFontFamily}`, color: "#111827", lineHeight: 22 },
        text: { font: `400 13px ${baseFontFamily}`, color: "#111827", lineHeight: 20 },
        muted: { font: `400 12px ${baseFontFamily}`, color: "#6b7280", lineHeight: 18 },
        emphasis: { font: `700 13px ${baseFontFamily}`, color: "#111827", lineHeight: 22 },
        totalLabel: { font: `700 14px ${baseFontFamily}`, color: "#111827", lineHeight: 24 },
        totalValue: { font: `700 18px ${baseFontFamily}`, color: "#111827", lineHeight: 26 },
        divider: 16,
      } as const;

      const paddingX = 20;
      const paddingY = 24;

      // Measure width
      const measCanvas = document.createElement("canvas");
      const measCtx = measCanvas.getContext("2d");
      if (!measCtx) throw new Error("No se pudo crear contexto de medición");
      const measureText = (t: string, f: string) => {
        measCtx.font = f;
        return measCtx.measureText(t).width;
      };
      const rowWidth = (l: string, r: string, lf: string, rf: string, gap = 8) =>
        measureText(l, lf) + measureText(r, rf) + paddingX * 2 + gap;

      const seqText = typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "-";
      const titleText = isSale ? `Venta #${seqText}` : `Orden de Venta #${seqText}`;
      const headerCandidates = [
        { text: cfg.companyName, font: styles.title.font },
        { text: cfg.subtitle, font: styles.subtitle.font },
        { text: titleText, font: styles.emphasis.font },
        { text: ticketDateFormatter.format(new Date(o.createdAt)), font: styles.muted.font },
      ];

      let neededWidth = 0;
      headerCandidates.forEach((h) => {
        neededWidth = Math.max(neededWidth, measureText(h.text, h.font) + paddingX * 2);
      });
      neededWidth = Math.max(
        neededWidth,
        rowWidth("Cliente:", o.clientName, styles.section.font, styles.text.font),
        rowWidth("CI:", o.clientDocumentId, styles.section.font, styles.text.font),
        rowWidth("Contacto:", o.clientPhone, styles.section.font, styles.text.font),
        rowWidth("Atendido por:", o.performedByUsername ? `${o.performedByUsername} - ${o.performedByRole === "admin" ? "Administrador" : "Operador"}` : "", styles.section.font, styles.text.font),
      );
      o.items.forEach((it) => {
        neededWidth = Math.max(
          neededWidth,
          rowWidth(it.productName, formatBs(it.lineTotal), styles.emphasis.font, styles.emphasis.font),
          measureText(`P/U: ${formatBs(it.unitPrice)}  ×  ${it.quantity}`, styles.muted.font) + paddingX * 2,
        );
      });
      neededWidth = Math.max(
        neededWidth,
        rowWidth("Subtotal:", formatBs(o.subtotal), styles.section.font, styles.text.font),
        rowWidth("Descuento:", formatBs(o.discount), styles.section.font, styles.text.font),
        rowWidth("TOTAL:", formatBs(o.total), styles.totalLabel.font, styles.totalValue.font),
        rowWidth("Método de Pago:", o.paymentMethod, styles.section.font, styles.text.font),
      );

      const minWidth = 360;
      const maxWidth = 540;
      const width = Math.max(minWidth, Math.min(maxWidth, Math.ceil(neededWidth)));
      const contentWidth = width - paddingX * 2;

      // Canvas
      const canvas = document.createElement("canvas");
      const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      const approxLines = 16 + o.items.length * 2 + 8;
      const approxHeight = paddingY * 2 + approxLines * 22 + 100;
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(approxHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo obtener el contexto de canvas");
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, approxHeight);
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(0, 0, 1, approxHeight);
      ctx.fillRect(width - 1, 0, 1, approxHeight);

      ctx.textBaseline = "top";
      let y = paddingY;

      const center = (t: string, f: string, c: string, lh: number) => {
        ctx.font = f;
        ctx.fillStyle = c;
        const w = ctx.measureText(t).width;
        ctx.fillText(t, Math.round((width - w) / 2), y);
        y += lh;
      };
      const row = (
        l: string,
        r: string,
        lf: string,
        rf: string,
        lc: string,
        rc: string,
        lh: number,
      ) => {
        ctx.font = lf;
        ctx.fillStyle = lc;
        ctx.fillText(l, paddingX, y);
        ctx.font = rf;
        ctx.fillStyle = rc;
        const rw = ctx.measureText(r).width;
        ctx.fillText(r, paddingX + contentWidth - rw, y);
        y += lh;
      };
      const divider = () => {
        ctx.font = styles.muted.font;
        ctx.fillStyle = "#9ca3af";
        const dashWidth = ctx.measureText("-").width || 4;
        const count = Math.max(8, Math.floor(contentWidth / dashWidth) - 2);
        const dashes = "-".repeat(count);
        const w = ctx.measureText(dashes).width;
        ctx.fillText(dashes, Math.round((width - w) / 2), y);
        y += styles.divider;
      };
      const muted = (t: string) => {
        ctx.font = styles.muted.font;
        ctx.fillStyle = styles.muted.color;
        ctx.fillText(t, paddingX, y);
        y += styles.muted.lineHeight;
      };
      const wrapped = (t: string, f: string, c: string, mw: number) => {
        const lines = wrapText(ctx as CanvasRenderingContext2D, t, f, mw);
        ctx.font = f;
        ctx.fillStyle = c;
        lines.forEach((ln) => {
          ctx.fillText(ln, paddingX, y);
          y += styles.text.lineHeight;
        });
      };

      // Header
      center(cfg.companyName, styles.title.font, styles.title.color, styles.title.lineHeight);
      center(cfg.subtitle, styles.subtitle.font, styles.subtitle.color, styles.subtitle.lineHeight);
      center(titleText, styles.emphasis.font, styles.emphasis.color, styles.emphasis.lineHeight);
      center(ticketDateFormatter.format(new Date(o.createdAt)), styles.muted.font, styles.muted.color, styles.muted.lineHeight);
      y = Math.max(y - 6, paddingY);
      divider();

      // Client and attendant
      row("Cliente:", o.clientName, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      row("CI:", o.clientDocumentId, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      row("Contacto:", o.clientPhone, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      row("Atendido por:", o.performedByUsername ? `${o.performedByUsername} - ${o.performedByRole === "admin" ? "Administrador" : "Operador"}` : "", styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      divider();

      // Items
      o.items.forEach((it) => {
        row(it.productName, formatBs(it.lineTotal), styles.emphasis.font, styles.emphasis.font, styles.emphasis.color, styles.emphasis.color, styles.emphasis.lineHeight);
        muted(`P/U: ${formatBs(it.unitPrice)}  ×  ${it.quantity}`);
        y += 4;
      });

      divider();
      // Totals
      row("Subtotal:", formatBs(o.subtotal), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      row("Descuento:", formatBs(o.discount), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);

      // Address box
      y += 6;
      const boxX = paddingX;
      const boxY = y;
      const boxW = contentWidth;
      const addrText = o.deliveryAddress || "-";
      const addressLines = wrapText(ctx as CanvasRenderingContext2D, addrText, styles.text.font, boxW - 20);
      const boxPaddingTop = 8;
      const boxPaddingBottom = 8;
      const titleHeight = styles.section.lineHeight;
      const contentHeight = addressLines.length * styles.text.lineHeight;
      const boxH = boxPaddingTop + titleHeight + contentHeight + boxPaddingBottom;
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "#e5e7eb";
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
      y += boxPaddingTop;
      ctx.font = styles.section.font;
      ctx.fillStyle = styles.section.color;
      ctx.fillText("Lugar de Envío:", boxX + 10, y);
      y += styles.section.lineHeight;
      ctx.font = styles.text.font;
      ctx.fillStyle = styles.text.color;
      addressLines.forEach((ln) => {
        ctx.fillText(ln, boxX + 10, y);
        y += styles.text.lineHeight;
      });
      y = boxY + boxH + 10;

      divider();
      // TOTAL emphasized
      ctx.font = styles.totalLabel.font;
      ctx.fillStyle = styles.totalLabel.color;
      ctx.fillText("TOTAL:", paddingX, y);
      ctx.font = styles.totalValue.font;
      const totalText = formatBs(o.total);
      const tw = ctx.measureText(totalText).width;
      ctx.fillText(totalText, paddingX + contentWidth - tw, y);
      y += styles.totalValue.lineHeight + 6;

      // Payment and optional notes
      row("Método de Pago:", o.paymentMethod, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
      if (o.notes && o.notes.trim()) {
        y += 4;
        ctx.font = styles.section.font;
        ctx.fillStyle = styles.section.color;
        ctx.fillText("Notas:", paddingX, y);
        y += styles.section.lineHeight - 2;
        wrapped(o.notes, styles.text.font, styles.text.color, contentWidth);
      }

      divider();
      const farewell = isSale ? cfg.sale.farewell : cfg.order.farewell;
      center(farewell, styles.subtitle.font, styles.subtitle.color, styles.subtitle.lineHeight + 6);

      // Crop and download
      const usedHeight = Math.ceil(y + paddingY);
      const usedHeightPx = Math.ceil(usedHeight * scale);
      if (usedHeightPx < canvas.height) {
        const temp = document.createElement("canvas");
        temp.width = Math.ceil(width * scale);
        temp.height = usedHeightPx;
        const tctx = temp.getContext("2d");
        if (tctx) tctx.drawImage(canvas, 0, 0, temp.width, temp.height, 0, 0, temp.width, temp.height);
        canvas.width = temp.width;
        canvas.height = temp.height;
        const cctx = canvas.getContext("2d");
        if (cctx) cctx.drawImage(temp, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((r) => resolve(r), "image/png", 0.95));
      if (!blob) throw new Error("No se pudo generar la imagen del ticket");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${isSale ? "venta" : "orden-venta"}-${o.sequence ?? o.id}.png`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);

      try { notify({ title: isSale ? "Ticket de venta" : "Ticket de orden", message: "Descarga iniciada.", variant: "success" }); } catch {}
    } catch (err) {
      console.warn("No se pudo generar el ticket desde historial:", err);
      try { notify({ title: "No se pudo descargar", message: "Intenta nuevamente.", variant: "error" }); } catch {}
    }
  };

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">
        Validando permisos...
      </main>
    );
  }

  if (user.role !== "admin" && user.role !== "operator") {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">
        Redirigiendo al dashboard...
      </main>
    );
  }

  return (
  <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-10 sm:gap-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Historial</p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Órdenes y Ventas registradas</h1>
          <p className="max-w-2xl text-sm text-slate-300">Busca por cliente, producto, método de pago, número o notas. Filtra por fechas y limpia el historial cuando lo necesites.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
        >
          Volver al dashboard
        </Link>
      </header>

      <section className="space-y-4 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Buscar</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Cliente, producto, pago, número, notas..."
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Desde</span>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              max={range.to || undefined}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Hasta</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              min={range.from || undefined}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Métodos de pago</span>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMethod(m)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    methods.includes(m)
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                      : "border-slate-800/60 bg-slate-950/60 text-slate-200 hover:border-sky-500/50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-4">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Registros: {filtered.length}</span>
            <button
              type="button"
              onClick={reload}
              className="rounded-lg border border-slate-700/60 px-2 py-1 text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Refrescar
            </button>
            {feedback ? (
              <span className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                {feedback}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {[5, 10, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>por página</span>
          </div>
          <div className="flex flex-wrap items-center gap-2"></div>
        </div>

        {/* Desktop/tablet table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                <th className="py-3 pr-4">Fecha</th>
                <th className="py-3 pr-4">Tipo</th>
                <th className="py-3 pr-4">N°</th>
                <th className="py-3 pr-4">Cliente</th>
                <th className="py-3 pr-4">Método</th>
                <th className="py-3 pr-4">Atendido por</th>
                <th className="py-3 pr-4 text-right">Total</th>
                <th className="py-3 pr-0 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">Sin resultados con los filtros actuales.</td>
                </tr>
              ) : (
                pageRows.map((o) => {
                  const date = new Date(o.createdAt);
                  const dateStr = `${dateToYMD(o.createdAt)} ${date.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`;
                  const seq = typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "-";
                  const kind = o.kind === "sale" ? "Venta" : "Orden";
                  const attended = o.performedByUsername && o.performedByRole
                    ? `${o.performedByUsername} - ${o.performedByRole === "admin" ? "Administrador" : "Operador"}`
                    : "-";
                  return (
                    <tr key={o.id} className="hover:bg-slate-950/40">
                      <td className="py-3 pr-4 text-slate-300">{dateStr}</td>
                      <td className="py-3 pr-4">{kind}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{seq}</td>
                      <td className="py-3 pr-4">{o.clientName}</td>
                      <td className="py-3 pr-4">{o.paymentMethod}</td>
                      <td className="py-3 pr-4">{attended}</td>
                      <td className="py-3 pr-0 text-right font-semibold">{formatBs(o.total)}</td>
                      <td className="py-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(o)}
                            aria-label="Descargar ticket"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                              <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v8.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L7.72 12.78a.75.75 0 111.06-1.06l2.47 2.47V4.5A.75.75 0 0112 3.75z" clipRule="evenodd" />
                              <path d="M3.75 15.75a.75.75 0 01.75-.75h15a.75.75 0 01.75.75v2.25A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18v-2.25z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetail(o)}
                            aria-label="Ver detalle"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.8"
                              stroke="currentColor"
                              className="h-5 w-5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 5 12 5c4.638 0 8.573 2.507 9.964 6.678.07.207.07.431 0 .644C20.577 16.49 16.64 19 12 19c-4.638 0-8.573-2.507-9.964-6.678z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => deleteOne(o.id)}
                              aria-label="Eliminar"
                              className="inline-flex items-center justify-center rounded-lg border border-rose-600/60 px-2.5 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="1.8"
                                stroke="currentColor"
                                className="h-5 w-5"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile list cards */}
        <div className="block space-y-3 md:hidden">
          {pageRows.length === 0 ? (
            <p className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
              Sin resultados con los filtros actuales.
            </p>
          ) : (
            pageRows.map((o) => {
              const date = new Date(o.createdAt);
              const dateStr = `${dateToYMD(o.createdAt)} ${date.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`;
              const seq = typeof o.sequence === "number" ? String(o.sequence).padStart(6, "0") : "-";
              const kind = o.kind === "sale" ? "Venta" : "Orden";
              const attended = o.performedByUsername && o.performedByRole
                ? `${o.performedByUsername} - ${o.performedByRole === "admin" ? "Administrador" : "Operador"}`
                : "-";
              return (
                <article key={o.id} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">{dateStr}</p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-100">{kind} #{seq}</h3>
                      <p className="truncate text-sm text-slate-300">{o.clientName}</p>
                      <p className="text-xs text-slate-400">{o.paymentMethod} • {attended}</p>
                    </div>
                    <p className="whitespace-nowrap text-right text-sm font-semibold">{formatBs(o.total)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(o)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetail(o)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      Ver
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteOne(o.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-rose-600/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-800/60 pt-4 sm:flex-row">
          <div className="text-xs text-slate-400">
            Página {current} de {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={current <= 1}
              className="rounded-xl border border-slate-700/60 px-3 py-1 text-xs text-slate-200 transition enabled:hover:border-sky-500/70 enabled:hover:text-sky-200 disabled:opacity-50"
            >
              Anterior
            </button>
            {/* Números de página simples (hasta 7) */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`rounded-lg border px-3 py-1 text-xs transition ${
                  n === current
                    ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                    : "border-slate-700/60 text-slate-200 hover:border-sky-500/70 hover:text-sky-200"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={current >= totalPages}
              className="rounded-xl border border-slate-700/60 px-3 py-1 text-xs text-slate-200 transition enabled:hover:border-sky-500/70 enabled:hover:text-sky-200 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={data.length === 0}
                className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                Vaciar Historial
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </section>
      {detail ? (
        <dialog
          open
          className="fixed left-1/2 top-1/2 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 transform rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 text-sm text-slate-200 shadow-2xl shadow-slate-950/50 backdrop:backdrop-blur"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-100">Detalle {detail.kind === "sale" ? "Venta" : "Orden"} #{typeof detail.sequence === "number" ? String(detail.sequence).padStart(6, "0") : "-"}</h2>
              <p className="text-xs text-slate-400">{new Date(detail.createdAt).toLocaleString("es-BO")}</p>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">Cliente</h3>
              <p><span className="text-slate-400">Nombre: </span>{detail.clientName}</p>
              <p><span className="text-slate-400">CI: </span>{detail.clientDocumentId}</p>
              <p><span className="text-slate-400">Contacto: </span>{detail.clientPhone}</p>
              <p><span className="text-slate-400">Dirección: </span>{detail.deliveryAddress || "-"}</p>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">Resumen</h3>
              <p><span className="text-slate-400">Método: </span>{detail.paymentMethod}</p>
              <p><span className="text-slate-400">Atendido por: </span>{detail.performedByUsername ? `${detail.performedByUsername} - ${detail.performedByRole === "admin" ? "Administrador" : "Operador"}` : "-"}</p>
              <p><span className="text-slate-400">Subtotal: </span>{formatBs(detail.subtotal)}</p>
              <p><span className="text-slate-400">Descuento: </span>{formatBs(detail.discount)}</p>
              <p className="font-semibold"><span className="text-slate-400">TOTAL: </span>{formatBs(detail.total)}</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4">Color</th>
                  <th className="py-2 pr-4">Cantidad</th>
                  <th className="py-2 pr-4">P/U</th>
                  <th className="py-2 pr-4">Stock actual</th>
                  <th className="py-2 pr-0 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {detail.items.map((it) => (
                  <tr key={`${it.productId}-${it.color}`}>
                    <td className="py-2 pr-4">{it.productName}</td>
                    <td className="py-2 pr-4">{it.color}</td>
                    <td className="py-2 pr-4">{it.quantity}</td>
                    <td className="py-2 pr-4">{formatBs(it.unitPrice)}</td>
                    <td className="py-2 pr-4">{inventoryMap[it.productId] ?? "-"}</td>
                    <td className="py-2 pr-0 text-right">{formatBs(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.notes ? (
            <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-400">Notas</span>
              <p className="mt-1 whitespace-pre-wrap text-sm">{detail.notes}</p>
            </div>
          ) : null}
        </dialog>
      ) : null}
    </main>
  );
}
