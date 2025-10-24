"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBs, parseBsInput } from "@/lib/currency";
import { useAuth, getRoleLabel } from "@/lib/auth-context";
import type { Client, Product, SalesOrder, SalesOrderPaymentMethod } from "@/lib/entities";
import { SALES_ORDER_PAYMENT_METHODS } from "@/lib/entities";
import { DEFAULT_TICKETS_CONFIG, type TicketsConfig } from "@/lib/settings";
import { listClients, listProducts, upsertClient, createOrder } from "@/lib/supabase-repo";
import { getTicketsConfigRemote } from "@/lib/supabase-repo";
import { useNotify } from "@/components/notifications/provider";

const PAYMENT_METHODS = SALES_ORDER_PAYMENT_METHODS;

type PaymentMethod = SalesOrderPaymentMethod;

type CartLine = {
  product: Product;
  quantity: number;
};

type QuickClientFormState = {
  name: string;
  documentId: string;
  phone: string;
  address: string;
};

const INITIAL_QUICK_CLIENT: QuickClientFormState = {
  name: "",
  documentId: "",
  phone: "",
  address: "",
};

const filterClientsByTerm = (clients: Client[], term: string) => {
  if (!term.trim()) return clients;
  const lowered = term.toLowerCase();
  return clients.filter(
    (c) =>
      c.name.toLowerCase().includes(lowered) ||
      c.documentId.toLowerCase().includes(lowered) ||
      c.phone.toLowerCase().includes(lowered) ||
      c.address.toLowerCase().includes(lowered)
  );
};

const filterProductsByTerm = (products: Product[], term: string) => {
  if (!term.trim()) return products;
  const lowered = term.toLowerCase();
  return products.filter(
    (p) => p.name.toLowerCase().includes(lowered) || p.color.toLowerCase().includes(lowered)
  );
};

// Cloud-only: clients and products se cargan desde Supabase

const validateQuickClient = (form: QuickClientFormState) => {
  if (!form.name.trim() || !form.documentId.trim() || !form.address.trim()) {
    return "Completa todos los campos obligatorios.";
  }
  const digits = form.phone.replace(/[\s+-]/g, "");
  if (digits.length < 7 || digits.length > 15) return "Ingresa un teléfono válido (7 a 15 dígitos).";
  return null;
};

// Cloud-only: el historial se almacena en Supabase (orders/order_items)

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

const downloadSaleTicket = async (order: SalesOrder, attendedByName?: string) => {
  try {
    const cfg = (await getTicketsConfigRemote<TicketsConfig>()) ?? DEFAULT_TICKETS_CONFIG;
    // Typography & styles
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
      spacer: 14,
    } as const;

    const paddingX = 20;
    const paddingY = 24;

    // Measure width based on content
    const measCanvas = document.createElement("canvas");
    const measCtx = measCanvas.getContext("2d");
    if (!measCtx) throw new Error("No se pudo crear contexto de medición");
    const measureText = (t: string, f: string) => {
      measCtx.font = f;
      return measCtx.measureText(t).width;
    };
    const rowWidth = (l: string, r: string, lf: string, rf: string, gap = 8) =>
      measureText(l, lf) + measureText(r, rf) + paddingX * 2 + gap;

    const seqText = typeof order.sequence === "number" ? String(order.sequence).padStart(6, "0") : "-";
    const headerCandidates = [
      { text: cfg.companyName, font: styles.title.font },
      { text: cfg.subtitle, font: styles.subtitle.font },
      { text: `Venta #${seqText}`, font: styles.emphasis.font },
      { text: ticketDateFormatter.format(new Date(order.createdAt)), font: styles.muted.font },
    ];

    let neededWidth = 0;
    headerCandidates.forEach((h) => {
      neededWidth = Math.max(neededWidth, measureText(h.text, h.font) + paddingX * 2);
    });
    neededWidth = Math.max(
      neededWidth,
      rowWidth("Cliente:", order.clientName, styles.section.font, styles.text.font),
      rowWidth("CI:", order.clientDocumentId, styles.section.font, styles.text.font),
      rowWidth("Contacto:", order.clientPhone, styles.section.font, styles.text.font),
      rowWidth("Atendido por:", attendedByName ?? "", styles.section.font, styles.text.font),
    );
    order.items.forEach((it) => {
      neededWidth = Math.max(
        neededWidth,
        rowWidth(it.productName, formatBs(it.lineTotal), styles.emphasis.font, styles.emphasis.font),
        measureText(`P/U: ${formatBs(it.unitPrice)}  ×  ${it.quantity}`, styles.muted.font) + paddingX * 2,
      );
    });
    neededWidth = Math.max(
      neededWidth,
      rowWidth("Subtotal:", formatBs(order.subtotal), styles.section.font, styles.text.font),
      rowWidth("Descuento:", formatBs(order.discount), styles.section.font, styles.text.font),
      rowWidth("TOTAL:", formatBs(order.total), styles.totalLabel.font, styles.totalValue.font),
      rowWidth("Método de Pago:", order.paymentMethod, styles.section.font, styles.text.font),
    );

    const minWidth = 360;
    const maxWidth = 540;
    const width = Math.max(minWidth, Math.min(maxWidth, Math.ceil(neededWidth)));
    const contentWidth = width - paddingX * 2;

    // HiDPI canvas
    const canvas = document.createElement("canvas");
    const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    const approxLines = 16 + order.items.length * 2 + 8;
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
    const seqTextRender = typeof order.sequence === "number" ? String(order.sequence).padStart(6, "0") : "-";
    center(`Venta #${seqTextRender}`, styles.emphasis.font, styles.emphasis.color, styles.emphasis.lineHeight);
  center(ticketDateFormatter.format(new Date(order.createdAt)), styles.muted.font, styles.muted.color, styles.muted.lineHeight);
  // Compactar espacio antes del divisor punteado
  y = Math.max(y - 6, paddingY);
  divider();

    // Client and attendant
    row("Cliente:", order.clientName, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    row("CI:", order.clientDocumentId, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    row("Contacto:", order.clientPhone, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    row("Atendido por:", attendedByName ?? "", styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    divider();

    // Items
    order.items.forEach((it) => {
      row(it.productName, formatBs(it.lineTotal), styles.emphasis.font, styles.emphasis.font, styles.emphasis.color, styles.emphasis.color, styles.emphasis.lineHeight);
      muted(`P/U: ${formatBs(it.unitPrice)}  ×  ${it.quantity}`);
      y += 4;
    });

    divider();
    // Totals
    row("Subtotal:", formatBs(order.subtotal), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    row("Descuento:", formatBs(order.discount), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);

    // Address box (dynamic height)
    y += 6;
    const boxX = paddingX;
    const boxY = y;
    const boxW = contentWidth;
    const addrText = order.deliveryAddress || "-";
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
    const totalText = formatBs(order.total);
    const tw = ctx.measureText(totalText).width;
    ctx.fillText(totalText, paddingX + contentWidth - tw, y);
    y += styles.totalValue.lineHeight + 6;

    // Payment and optional notes
    row("Método de Pago:", order.paymentMethod, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    if (order.notes && order.notes.trim()) {
      y += 4;
      ctx.font = styles.section.font;
      ctx.fillStyle = styles.section.color;
      ctx.fillText("Notas:", paddingX, y);
      y += styles.section.lineHeight - 2;
      wrapped(order.notes, styles.text.font, styles.text.color, contentWidth);
    }

    divider();
  center(cfg.sale.farewell, styles.subtitle.font, styles.subtitle.color, styles.subtitle.lineHeight + 6);

  // Crop to used height
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
    a.download = `venta-${order.sequence ?? order.id}.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);

    return true;
  } catch (err) {
    console.warn("No se pudo generar el ticket de la venta:", err);
    return false;
  }
};

export default function RegisterSalePage() {
  const router = useRouter();
  const { user, isHydrated } = useAuth();
  const notify = useNotify();

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClient, setQuickClient] = useState<QuickClientFormState>(INITIAL_QUICK_CLIENT);
  const [quickClientError, setQuickClientError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");
  const [discount, setDiscount] = useState("0");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const quickClientDialogRef = useRef<HTMLDialogElement | null>(null);
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role !== "admin" && user.role !== "operator") {
      router.replace("/dashboard");
      return;
    }
    if (hasLoadedData) return;
    (async () => {
      try {
        const [remoteClients, remoteProducts] = await Promise.all([listClients(), listProducts()]);
        setClients(
          remoteClients.map((c) => ({
            id: c.id,
            name: c.name,
            documentId: c.documentId,
            phone: c.phone,
            address: c.address,
            createdAt: c.createdAt,
          }))
        );
        setProducts(
          remoteProducts.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            stock: p.stock,
            cost: p.cost,
            salePrice: p.salePrice,
            image: p.image,
            createdAt: p.createdAt,
          }))
        );
      } catch (err) {
        console.error("Error cargando datos iniciales desde la nube", err);
      } finally {
        setHasLoadedData(true);
      }
    })();
  }, [hasLoadedData, isHydrated, router, user]);

  useEffect(() => {
    if (!showQuickClient) return;
    const dialog = quickClientDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog && dialog.open) dialog.close();
    };
  }, [showQuickClient]);

  const filteredClients = useMemo(() => filterClientsByTerm(clients, clientSearch), [clients, clientSearch]);
  const filteredProducts = useMemo(() => filterProductsByTerm(products, productSearch), [products, productSearch]);

  const subtotal = cart.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);
  const discountAmount = parseBsInput(discount) ?? 0;
  const total = Math.max(0, subtotal - discountAmount);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch("");
    setDeliveryAddress(client.address);
    setFeedback(null);
  };

  const handleAddProduct = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        const next = prev.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) }
            : line
        );
        const input = quantityInputRefs.current[product.id];
        if (input) {
          input.focus();
          input.select();
        }
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
    setFeedback(`Producto "${product.name}" agregado al carrito.`);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((line) =>
        line.product.id === productId
          ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.stock)) }
          : line
      )
    );
  };

  const handleAdjustQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.product.id !== productId) return line;
        const nextQuantity = Math.max(1, Math.min(line.quantity + delta, line.product.stock));
        return { ...line, quantity: nextQuantity };
      })
    );
  };

  const handleRemoveLine = (productId: string) => {
    setCart((prev) => prev.filter((line) => line.product.id !== productId));
  };

  const handleAddQuickClient = async () => {
    const validation = validateQuickClient(quickClient);
    if (validation) {
      setQuickClientError(validation);
      return;
    }
    try {
      const saved = await upsertClient({
        name: quickClient.name.trim(),
        documentId: quickClient.documentId.trim(),
        phone: quickClient.phone.trim(),
        address: quickClient.address.trim(),
      });
      const newClient: Client = {
        id: saved.id,
        name: saved.name,
        documentId: saved.documentId,
        phone: saved.phone,
        address: saved.address,
        createdAt: saved.createdAt,
      };
      setClients((prev) => [newClient, ...prev]);
      setSelectedClient(newClient);
      setDeliveryAddress(newClient.address);
      setQuickClient(INITIAL_QUICK_CLIENT);
      setQuickClientError(null);
      setShowQuickClient(false);
      setFeedback(`Cliente "${newClient.name}" registrado y seleccionado.`);
      try {
        notify({
          title: "Cliente guardado",
          message: `Se registró ${newClient.name} y quedó seleccionado para la venta.`,
          variant: "success",
        });
      } catch {}
    } catch (err) {
      setQuickClientError("No se pudo guardar el cliente en la nube.");
    }
  };

  const resetSale = () => {
    setSelectedClient(null);
    setClientSearch("");
    setCart([]);
    setDiscount("0");
    setPaymentMethod("Efectivo");
    setDeliveryAddress("");
    setNotes("");
    setFeedback(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!user) {
      return;
    }
    if (!selectedClient) {
      setFormError("Selecciona o crea un cliente antes de continuar.");
      return;
    }
    if (cart.length === 0) {
      setFormError("Agrega al menos un producto al carrito.");
      return;
    }
    if (discountAmount > subtotal) {
      setFormError("El descuento no puede superar el subtotal.");
      return;
    }

    const normalizedAddress = deliveryAddress.trim() || "Retiro en tienda";
    const createdAt = new Date().toISOString();

    // 1) Releer inventario actual desde la nube para validar stock a tiempo real
    const currentInventory = await listProducts();
    const problems: string[] = [];
    for (const line of cart) {
      const p = currentInventory.find((prod) => prod.id === line.product.id);
      if (!p) {
        problems.push(`Producto no encontrado: ${line.product.name} (${line.product.color}).`);
        continue;
      }
      if (p.stock < line.quantity) {
        problems.push(
          `${line.product.name} (${line.product.color}): stock insuficiente (disponible ${p.stock}, requerido ${line.quantity}).`
        );
      }
    }
    if (problems.length > 0) {
      setFormError(
        `No se puede registrar la venta por stock insuficiente:\n- ${problems.join("\n- ")}`
      );
      return;
    }

    // 2) Registrar orden en la nube (createOrder se encarga de descontar stock si es 'sale')

    // Crear orden en Supabase
    const created = await createOrder({
      kind: "sale",
      total,
      payment_method: paymentMethod,
      performed_by_username: user.username,
      performed_by_role: user.role,
      client_id: selectedClient.id,
      client_name: selectedClient.name,
      client_document_id: selectedClient.documentId,
      client_phone: selectedClient.phone,
      delivery_address: normalizedAddress,
      subtotal,
      discount: discountAmount,
      notes: notes.trim(),
      items: cart.map((line) => ({
        product_id: line.product.id,
        product_name: line.product.name,
        color: line.product.color,
        qty: line.quantity,
        unit_price: line.product.salePrice,
        subtotal: line.product.salePrice * line.quantity,
      })),
    });

    // Refrescar inventario localmente (opcional) para reflejar stock actualizado
    try {
      const refreshed = await listProducts();
      setProducts(
        refreshed.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          stock: p.stock,
          cost: p.cost,
          salePrice: p.salePrice,
          image: p.image,
          createdAt: p.createdAt,
        }))
      );
    } catch {}

    // Mapear a SalesOrder (tipo UI) para el ticket
    const order: SalesOrder = {
      id: created.id,
      kind: "sale",
      performedByUsername: created.performed_by_username,
      performedByRole:
        created.performed_by_role === "admin" || created.performed_by_role === "operator"
          ? created.performed_by_role
          : user.role,
      clientId: created.client_id || selectedClient.id,
      clientName: created.client_name || selectedClient.name,
      clientDocumentId: created.client_document_id || selectedClient.documentId,
      clientPhone: created.client_phone || selectedClient.phone,
      deliveryAddress: created.delivery_address || normalizedAddress,
      paymentMethod: paymentMethod,
      sequence: created.sequence,
      subtotal: created.subtotal ?? subtotal,
      discount: created.discount ?? discountAmount,
      total: created.total,
      notes: created.notes || notes.trim(),
      createdAt: created.created_at || createdAt,
      items: cart.map((line) => ({
        productId: line.product.id,
        productName: line.product.name,
        color: line.product.color,
        quantity: line.quantity,
        unitPrice: line.product.salePrice,
        lineTotal: line.product.salePrice * line.quantity,
      })),
    };
    const attendedBy = user ? `${user.username} - ${getRoleLabel(user.role)}` : undefined;
    const ticketGenerated = await downloadSaleTicket(order, attendedBy);

    setFormError(null);
    resetSale();
    setFeedback(
      ticketGenerated
        ? "Venta registrada en la nube, inventario actualizado y ticket descargado."
        : "Venta registrada en la nube e inventario actualizado, pero no se pudo descargar el ticket automáticamente."
    );
    try {
      if (ticketGenerated) {
        notify({
          title: "Venta registrada",
          message: `Inventario actualizado. Total ${formatBs(total)}. Ticket descargado.`,
          variant: "success",
        });
      } else {
        notify({
          title: "Venta registrada",
          message: `Inventario actualizado. Total ${formatBs(total)}. No se pudo descargar el ticket automáticamente.`,
          variant: "warning",
        });
      }
    } catch {}
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
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Registrar Venta</p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">Registra ventas rápidas</h1>
          <p className="max-w-2xl text-sm text-slate-300">Selecciona cliente, agrega productos y descarga el ticket de la venta.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
        >
          Volver al dashboard
        </Link>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-800/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Cliente</h2>
                <p className="text-xs text-slate-400">Busca en tu base o regístralo al instante.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickClient(true);
                    setFeedback(null);
                    setFormError(null);
                  }}
                  className="rounded-xl border border-sky-500/70 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
                >
                  Nuevo cliente rápido
                </button>
                {selectedClient ? (
                  <span className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                    Seleccionado: {selectedClient.name}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Buscar cliente</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2">
                  <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
                  </svg>
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Nombre, CI, teléfono o dirección"
                    className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
              </label>

              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Clientes recientes</span>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-slate-800/60 bg-slate-950/40 p-3 text-sm">
                  {filteredClients.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin resultados para la búsqueda.</p>
                  ) : (
                    filteredClients.slice(0, 6).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className={`flex w-full flex-col items-start rounded-2xl border px-3 py-2 text-left transition ${
                          selectedClient?.id === client.id
                            ? "border-sky-500/70 bg-sky-500/10 text-sky-100"
                            : "border-transparent bg-slate-950/40 text-slate-200 hover:border-sky-500/40"
                        }`}
                      >
                        <span className="text-sm font-semibold">{client.name}</span>
                        <span className="text-xs text-slate-400">CI: {client.documentId}</span>
                        <span className="text-xs text-slate-400">{client.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-800/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Productos</h2>
                <p className="text-xs text-slate-400">Visualiza stock y agrega al carrito.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  Buscar
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Nombre o color"
                    className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="grid max-h-[34rem] gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No hay productos que coincidan con la búsqueda. Gestiona el inventario para añadir disponibles.
                </p>
              ) : (
                filteredProducts.map((product) => (
                  <article
                    key={product.id}
                    className="flex flex-col gap-3 rounded-3xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-300 shadow-inner shadow-slate-950/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70">
                        {product.image ? (
                          <Image
                            src={product.image.dataUrl}
                            alt={product.name}
                            width={64}
                            height={64}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-[11px] text-slate-500">Sin imagen</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400">{formatBs(product.salePrice)}</p>
                        <h3 className="text-base font-semibold text-slate-100">{product.name}</h3>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Color {product.color}</p>
                        <p className="text-xs text-slate-500">Stock disponible: {product.stock}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProduct(product)}
                      disabled={product.stock === 0}
                      className="inline-flex items-center justify-center rounded-xl border border-sky-500/70 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {product.stock === 0 ? "Sin stock" : "Añadir al carrito"}
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-800/60 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Carrito</h2>
              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-medium text-slate-400 underline underline-offset-4 transition hover:text-slate-200"
                >
                  Vaciar carrito
                </button>
              ) : null}
            </div>

            {cart.length === 0 ? (
              <p className="rounded-3xl border border-slate-800/60 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
                Agrega productos para comenzar a registrar la venta.
              </p>
            ) : (
              <div className="max-h-[24rem] space-y-4 overflow-y-auto pr-1">
                {cart.map((line) => (
                  <div
                    key={line.product.id}
                    className="flex flex-col gap-3 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1 text-sm text-slate-200">
                      <span className="font-semibold">{line.product.name}</span>
                      <span className="text-xs text-slate-400">Color {line.product.color}</span>
                      <span className="text-xs text-slate-400">Precio U.: {formatBs(line.product.salePrice)}</span>
                    </div>
                    <div className="flex flex-col items-start gap-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-200">Cantidad</span>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-950/60 px-2 py-1 text-sm text-slate-100">
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(line.product.id, 1)}
                            disabled={line.quantity >= line.product.stock}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800/60 text-base font-semibold text-slate-100 transition hover:border-sky-500/70 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Aumentar cantidad"
                          >
                            +
                          </button>
                          <input
                            ref={(el) => {
                              quantityInputRefs.current[line.product.id] = el;
                            }}
                            value={line.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(
                                line.product.id,
                                Number.parseInt(e.target.value, 10) || 1
                              )
                            }
                            onBlur={(e) => {
                              const parsed = Number.parseInt(e.target.value, 10);
                              if (Number.isNaN(parsed)) handleUpdateQuantity(line.product.id, 1);
                            }}
                            type="number"
                            min={1}
                            max={line.product.stock}
                            className="h-7 w-16 appearance-none rounded-lg border border-slate-800/60 bg-slate-950/60 text-center text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                            aria-label={`Cantidad de ${line.product.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(line.product.id, -1)}
                            disabled={line.quantity <= 1}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800/60 text-base font-semibold text-slate-100 transition hover:border-sky-500/70 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Disminuir cantidad"
                          >
                            -
                          </button>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">Stock restante: {line.product.stock - line.quantity}</span>
                      <span className="text-sm font-semibold text-slate-100">{formatBs(line.product.salePrice * line.quantity)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.product.id)}
                        className="text-xs font-medium text-rose-300 underline underline-offset-4 transition hover:text-rose-200"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Resumen</h2>
            <div className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between text-slate-300">
                <span>Subtotal</span>
                <span>{formatBs(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Descuento (Bs.)
                  <input
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0,00"
                    className="w-24 rounded-lg border border-slate-800/60 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </label>
                <span>-{formatBs(Math.min(discountAmount, subtotal))}</span>
              </div>
              <label className="flex flex-col gap-2 text-xs text-slate-400">
                Lugar de envío
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Dirección de entrega u observaciones"
                  rows={3}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs text-slate-400">
                Método de pago
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs text-slate-400">
                Notas
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Indicaciones adicionales, responsable, condiciones, etc."
                  rows={3}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/60 pt-4 text-base font-semibold text-slate-100">
              <span>Total a cobrar</span>
              <span>{formatBs(total)}</span>
            </div>

            {formError ? (
              <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formError}</p>
            ) : null}

            {feedback ? (
              <p className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{feedback}</p>
            ) : null}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 transition hover:opacity-95"
              >
                Registrar venta
              </button>
              <button
                type="button"
                onClick={resetSale}
                className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-500/70 hover:text-rose-200"
              >
                Reiniciar borrador
              </button>
            </div>
          </div>
        </aside>
      </section>

      <dialog
        ref={quickClientDialogRef}
        className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 transform rounded-3xl border border-slate-800/70 bg-slate-900/90 p-6 text-sm text-slate-200 shadow-2xl shadow-slate-950/50 backdrop:backdrop-blur"
        onClose={() => setShowQuickClient(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddQuickClient();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Nuevo cliente rápido</h2>
              <p className="text-xs text-slate-400">Quedará guardado automáticamente en tu base de clientes.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickClient(false)}
              className="rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Cerrar
            </button>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Nombre *</span>
            <input
              required
              value={quickClient.name}
              onChange={(e) => {
                setQuickClient((prev) => ({ ...prev, name: e.target.value }));
                setQuickClientError(null);
              }}
              placeholder="Ej. Laura Castellón"
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Carnet de identidad *</span>
            <input
              required
              value={quickClient.documentId}
              onChange={(e) => {
                setQuickClient((prev) => ({ ...prev, documentId: e.target.value.toUpperCase() }));
                setQuickClientError(null);
              }}
              placeholder="Ej. 1234567 LP"
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Celular o teléfono *</span>
            <input
              required
              value={quickClient.phone}
              onChange={(e) => {
                setQuickClient((prev) => ({ ...prev, phone: e.target.value }));
                setQuickClientError(null);
              }}
              placeholder="Ej. +591 71234567"
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Dirección *</span>
            <textarea
              required
              value={quickClient.address}
              onChange={(e) => {
                setQuickClient((prev) => ({ ...prev, address: e.target.value }));
                setQuickClientError(null);
              }}
              placeholder="Ej. Calle Las Flores #55, Zona Norte"
              rows={3}
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          {quickClientError ? (
            <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{quickClientError}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/50 transition hover:opacity-95"
            >
              Guardar cliente
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickClient(INITIAL_QUICK_CLIENT);
                setQuickClientError(null);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-700/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-500/70 hover:text-rose-200"
            >
              Limpiar campos
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
