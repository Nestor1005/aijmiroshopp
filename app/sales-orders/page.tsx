'use client';

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBs, parseBsInput } from "@/lib/currency";
import { useAuth, getRoleLabel } from "@/lib/auth-context";
import type { Client, Product, SalesOrder, SalesOrderPaymentMethod } from "@/lib/entities";
import { SAMPLE_CLIENTS, SAMPLE_PRODUCTS, SALES_ORDER_PAYMENT_METHODS } from "@/lib/entities";
import { CLIENTS_STORAGE_KEY, INVENTORY_STORAGE_KEY, SALES_ORDERS_STORAGE_KEY } from "@/lib/storage";
import { getTicketsConfig, saveTicketsConfig } from "@/lib/settings";
import { useNotify } from "@/components/notifications/provider";
import { uid } from "@/lib/id";

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
  if (!term.trim()) {
    return clients;
  }

  const lowered = term.toLowerCase();
  return clients.filter(
    (client) =>
      client.name.toLowerCase().includes(lowered) ||
      client.documentId.toLowerCase().includes(lowered) ||
      client.phone.toLowerCase().includes(lowered) ||
      client.address.toLowerCase().includes(lowered),
  );
};

const filterProductsByTerm = (products: Product[], term: string) => {
  if (!term.trim()) {
    return products;
  }

  const lowered = term.toLowerCase();
  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(lowered) ||
      product.color.toLowerCase().includes(lowered),
  );
};

const getStoredClients = () => {
  try {
    const raw = window.localStorage.getItem(CLIENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Client[];
      if (Array.isArray(parsed)) {
        return parsed.map((client) => ({ ...client }));
      }
    }
  } catch (error) {
    console.warn("No se pudo leer la lista de clientes desde localStorage:", error);
  }

  const fallback = SAMPLE_CLIENTS.map((client) => ({ ...client }));

  try {
    window.localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(fallback));
  } catch (storageError) {
    console.warn("No se pudo preparar la lista de clientes en localStorage:", storageError);
  }

  return fallback;
};

const getStoredProducts = () => {
  try {
    const raw = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed)) {
        return parsed.map((product) => ({ ...product }));
      }
    }
  } catch (error) {
    console.warn("No se pudo leer el inventario desde localStorage:", error);
  }

  const fallback = SAMPLE_PRODUCTS.map((product) => ({ ...product }));

  try {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(fallback));
  } catch (storageError) {
    console.warn("No se pudo preparar el inventario en localStorage:", storageError);
  }

  return fallback;
};

const validateQuickClient = (form: QuickClientFormState) => {
  if (!form.name.trim() || !form.documentId.trim() || !form.address.trim()) {
    return "Completa todos los campos obligatorios.";
  }

  const digits = form.phone.replace(/[\s+-]/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "Ingresa un teléfono válido (7 a 15 dígitos).";
  }

  return null;
};

const loadStoredSalesOrders = () => {
  try {
    const raw = window.localStorage.getItem(SALES_ORDERS_STORAGE_KEY);
    if (!raw) {
      return [] as SalesOrder[];
    }

    const parsed = JSON.parse(raw) as SalesOrder[];
    if (Array.isArray(parsed)) {
      return parsed.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }));
    }
  } catch (error) {
    console.warn("No se pudo leer el historial de ordenes de venta desde localStorage:", error);
  }

  return [] as SalesOrder[];
};

const persistSalesOrder = (order: SalesOrder) => {
  try {
    const current = loadStoredSalesOrders();
    window.localStorage.setItem(
      SALES_ORDERS_STORAGE_KEY,
      JSON.stringify([order, ...current]),
    );
  } catch (error) {
    console.warn("No se pudo guardar la orden de venta en localStorage:", error);
  }
};

const ticketDateFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium",
  timeStyle: "medium",
});

//

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
): string[] => {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

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

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

//

const downloadOrderTicket = async (order: SalesOrder, attendedByName?: string) => {
  try {
    const cfg = getTicketsConfig();
    // Estilos tipográficos y utilidades de medición
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

    const paddingX = 20; // later used for width computation
    const paddingY = 24;

    const measCanvas = document.createElement("canvas");
    const measCtx = measCanvas.getContext("2d");
    if (!measCtx) throw new Error("No se pudo crear contexto de medición");

    const measureText = (text: string, font: string) => {
      measCtx.font = font;
      return measCtx.measureText(text).width;
    };
    const rowWidth = (
      left: string,
      right: string,
      leftFont: string,
      rightFont: string,
      gap = 8,
    ) => measureText(left, leftFont) + measureText(right, rightFont) + paddingX * 2 + gap;

    // Preparar textos a medir según contenido
    const seqText = typeof order.sequence === "number" ? String(order.sequence).padStart(6, "0") : "-";
    const headerCandidates = [
      { text: cfg.companyName, font: styles.title.font },
      { text: cfg.subtitle, font: styles.subtitle.font },
      { text: `Orden de Venta #${seqText}`, font: styles.emphasis.font },
      { text: ticketDateFormatter.format(new Date(order.createdAt)), font: styles.muted.font },
    ];

    let neededWidth = 0;
    // header centered text widths
    headerCandidates.forEach((h) => {
      neededWidth = Math.max(neededWidth, measureText(h.text, h.font) + paddingX * 2);
    });
    // client rows
    neededWidth = Math.max(
      neededWidth,
      rowWidth("Cliente:", order.clientName, styles.section.font, styles.text.font),
      rowWidth("CI:", order.clientDocumentId, styles.section.font, styles.text.font),
      rowWidth("Contacto:", order.clientPhone, styles.section.font, styles.text.font),
      rowWidth("Atendido por:", attendedByName ?? "", styles.section.font, styles.text.font),
    );
    // items
    order.items.forEach((it) => {
      neededWidth = Math.max(
        neededWidth,
        rowWidth(it.productName, formatBs(it.lineTotal), styles.emphasis.font, styles.emphasis.font),
        measureText(`P/U: ${formatBs(it.unitPrice)}  ×  ${it.quantity}`, styles.muted.font) + paddingX * 2,
      );
    });
    // totals
    neededWidth = Math.max(
      neededWidth,
      rowWidth("Subtotal:", formatBs(order.subtotal), styles.section.font, styles.text.font),
      rowWidth("Descuento:", formatBs(order.discount), styles.section.font, styles.text.font),
      rowWidth("TOTAL:", formatBs(order.total), styles.totalLabel.font, styles.totalValue.font),
      rowWidth("Método de Pago:", order.paymentMethod, styles.section.font, styles.text.font),
    );

    // Ancho adaptativo con límites razonables
  const minWidth = 360; // más angosto por defecto
  const maxWidth = 540; // limita el ensanchado
    const width = Math.max(minWidth, Math.min(maxWidth, Math.ceil(neededWidth)));
    const contentWidth = width - paddingX * 2;

    // Canvas principal escalado para HiDPI
    const canvas = document.createElement("canvas");
    const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    const approxLines = 16 + order.items.length * 2 + 8; // estimate logical lines
    const approxHeight = paddingY * 2 + approxLines * 22 + 100; // logical px
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(approxHeight * scale);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se pudo obtener el contexto de canvas");
    }

    // Apply scaling to draw in logical coords
    context.scale(scale, scale);

    // Fondo blanco tipo recibo con bordes sutiles
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, approxHeight);
    context.fillStyle = "#e5e7eb";
    context.fillRect(0, 0, 1, approxHeight);
    context.fillRect(width - 1, 0, 1, approxHeight);

    context.textBaseline = "top";
    let cursorY = paddingY;

    // Helpers
    const drawCentered = (text: string, font: string, color: string, lineHeight: number) => {
      context.font = font;
      context.fillStyle = color;
      const w = context.measureText(text).width;
      context.fillText(text, Math.round((width - w) / 2), cursorY);
      cursorY += lineHeight;
    };

    const drawRow = (
      left: string,
      right: string,
      leftFont: string,
      rightFont: string,
      colorLeft: string,
      colorRight: string,
      lineHeight: number,
    ) => {
      context.font = leftFont;
      context.fillStyle = colorLeft;
      context.fillText(left, paddingX, cursorY);
      context.font = rightFont;
      context.fillStyle = colorRight;
      const rw = context.measureText(right).width;
      context.fillText(right, paddingX + contentWidth - rw, cursorY);
      cursorY += lineHeight;
    };

    const drawDivider = () => {
      context.font = styles.muted.font;
      context.fillStyle = "#9ca3af";
      const dashWidth = context.measureText("-").width || 4;
      const count = Math.max(8, Math.floor(contentWidth / dashWidth) - 2);
      const dashes = "-".repeat(count);
      const w = context.measureText(dashes).width;
      context.fillText(dashes, Math.round((width - w) / 2), cursorY);
      cursorY += styles.divider;
    };

    const drawMuted = (text: string) => {
      context.font = styles.muted.font;
      context.fillStyle = styles.muted.color;
      context.fillText(text, paddingX, cursorY);
      cursorY += styles.muted.lineHeight;
    };

    const drawWrapped = (text: string, font: string, color: string, maxWidth: number) => {
      const lines = wrapText(context, text, font, maxWidth);
      context.font = font;
      context.fillStyle = color;
      lines.forEach((l) => {
        context.fillText(l, paddingX, cursorY);
        cursorY += styles.text.lineHeight;
      });
    };

    // Encabezado
  drawCentered(cfg.companyName, styles.title.font, styles.title.color, styles.title.lineHeight);
    drawCentered(cfg.subtitle, styles.subtitle.font, styles.subtitle.color, styles.subtitle.lineHeight);
  const seqTextRender = typeof order.sequence === "number" ? String(order.sequence).padStart(6, "0") : "-";
  drawCentered(`Orden de Venta #${seqTextRender}`, styles.emphasis.font, styles.emphasis.color, styles.emphasis.lineHeight);
  drawCentered(ticketDateFormatter.format(new Date(order.createdAt)), styles.muted.font, styles.muted.color, styles.muted.lineHeight);
  // Compactar espacio antes del divisor punteado
  cursorY = Math.max(cursorY - 6, paddingY);
  drawDivider();

    // Cliente y atendido
    drawRow("Cliente:", order.clientName, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
  drawRow("CI:", order.clientDocumentId, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
  drawRow("Contacto:", order.clientPhone, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
  drawRow("Atendido por:", attendedByName ?? "", styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    drawDivider();

    // Items
    order.items.forEach((item) => {
      drawRow(item.productName, formatBs(item.lineTotal), styles.emphasis.font, styles.emphasis.font, styles.emphasis.color, styles.emphasis.color, styles.emphasis.lineHeight);
      drawMuted(`P/U: ${formatBs(item.unitPrice)}  ×  ${item.quantity}`);
      cursorY += 4;
    });

    drawDivider();
    // Totales
  drawRow("Subtotal:", formatBs(order.subtotal), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
  drawRow("Descuento:", formatBs(order.discount), styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);

    // Caja Lugar de Envío (altura dinámica)
    cursorY += 6;
    const boxX = paddingX;
    const boxY = cursorY;
    const boxW = contentWidth;
    // Calcular alto según contenido
    const addrText = order.deliveryAddress || "-";
    const addressLines = wrapText(context, addrText, styles.text.font, boxW - 20);
    const boxPaddingTop = 8;
    const boxPaddingBottom = 8;
    const titleHeight = styles.section.lineHeight;
    const contentHeight = addressLines.length * styles.text.lineHeight;
    const boxH = boxPaddingTop + titleHeight + contentHeight + boxPaddingBottom;
    // Dibujar fondo y borde
    context.fillStyle = "#f3f4f6";
    context.fillRect(boxX, boxY, boxW, boxH);
    context.strokeStyle = "#e5e7eb";
    context.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    // Texto interno
    cursorY += boxPaddingTop;
    context.font = styles.section.font;
    context.fillStyle = styles.section.color;
    context.fillText("Lugar de Envío:", boxX + 10, cursorY);
    cursorY += styles.section.lineHeight;
    context.font = styles.text.font;
    context.fillStyle = styles.text.color;
    addressLines.forEach((l) => {
      context.fillText(l, boxX + 10, cursorY);
      cursorY += styles.text.lineHeight;
    });
    cursorY = boxY + boxH + 10;

    drawDivider();
    // TOTAL destacado
    context.font = styles.totalLabel.font;
    context.fillStyle = styles.totalLabel.color;
    context.fillText("TOTAL:", paddingX, cursorY);
    context.font = styles.totalValue.font;
    const totalText = formatBs(order.total);
    const tw = context.measureText(totalText).width;
    context.fillText(totalText, paddingX + contentWidth - tw, cursorY);
    cursorY += styles.totalValue.lineHeight + 6;

    // Método de pago y notas opcionales
    drawRow("Método de Pago:", order.paymentMethod, styles.section.font, styles.text.font, styles.section.color, styles.text.color, styles.text.lineHeight);
    if (order.notes && order.notes.trim()) {
      cursorY += 4;
      context.font = styles.section.font;
      context.fillStyle = styles.section.color;
      context.fillText("Notas:", paddingX, cursorY);
      cursorY += styles.section.lineHeight - 2;
      drawWrapped(order.notes, styles.text.font, styles.text.color, contentWidth);
    }

    drawDivider();
  drawCentered(cfg.order.farewell, styles.subtitle.font, styles.subtitle.color, styles.subtitle.lineHeight + 6);

    // Recortar a alto usado
    const usedHeight = Math.ceil(cursorY + paddingY); // logical px
    const usedHeightPx = Math.ceil(usedHeight * scale);
    if (usedHeightPx < canvas.height) {
      const temp = document.createElement("canvas");
      temp.width = Math.ceil(width * scale);
      temp.height = usedHeightPx;
      const tctx = temp.getContext("2d");
      if (tctx) {
        // draw from original pixel canvas
        tctx.drawImage(canvas, 0, 0, temp.width, temp.height, 0, 0, temp.width, temp.height);
      }
      canvas.width = temp.width;
      canvas.height = temp.height;
      const cctx = canvas.getContext("2d");
      if (cctx) {
        cctx.drawImage(temp, 0, 0);
      }
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/png", 0.95),
    );

    if (!blob) {
      throw new Error("No se pudo generar la imagen del ticket");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orden-venta-${order.sequence ?? order.id}.png`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);

    return true;
  } catch (error) {
    console.warn("No se pudo generar el ticket de la orden de venta:", error);
    return false;
  }
};

export default function SalesOrdersPage() {
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
    if (!isHydrated) {
      return;
    }

    if (!user) {
      router.replace("/");
      return;
    }

    if (user.role !== "admin" && user.role !== "operator") {
      router.replace("/dashboard");
      return;
    }

    if (hasLoadedData) {
      return;
    }

    try {
      const storedClients = getStoredClients();
      const storedProducts = getStoredProducts();
      setClients(storedClients);
      setProducts(storedProducts);
    } finally {
      setHasLoadedData(true);
    }
  }, [hasLoadedData, isHydrated, router, user]);

  useEffect(() => {
    if (!showQuickClient) {
      return;
    }

    const dialog = quickClientDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog && dialog.open) {
        dialog.close();
      }
    };
  }, [showQuickClient]);

  const filteredClients = useMemo(
    () => filterClientsByTerm(clients, clientSearch),
    [clients, clientSearch],
  );

  const filteredProducts = useMemo(
    () => filterProductsByTerm(products, productSearch),
    [products, productSearch],
  );

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
            : line,
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
          : line,
      ),
    );
  };

  const handleAdjustQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.product.id !== productId) {
          return line;
        }

        const nextQuantity = Math.max(
          1,
          Math.min(line.quantity + delta, line.product.stock),
        );

        return { ...line, quantity: nextQuantity };
      }),
    );
  };

  const handleRemoveLine = (productId: string) => {
    setCart((prev) => prev.filter((line) => line.product.id !== productId));
  };

  const handleAddQuickClient = () => {
    const validation = validateQuickClient(quickClient);
    if (validation) {
      setQuickClientError(validation);
      return;
    }

    const newClient: Client = {
      id: uid(),
      name: quickClient.name.trim(),
      documentId: quickClient.documentId.trim(),
      phone: quickClient.phone.trim(),
      address: quickClient.address.trim(),
      createdAt: new Date().toISOString(),
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
        message: `Se registró ${newClient.name} y quedó seleccionado para la orden.`,
        variant: "success",
      });
    } catch {}

    try {
      const current = getStoredClients();
      window.localStorage.setItem(
        CLIENTS_STORAGE_KEY,
        JSON.stringify([newClient, ...current]),
      );
    } catch (error) {
      console.warn("No se pudo sincronizar la lista de clientes tras alta rápida:", error);
    }
  };

  const resetOrder = () => {
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
    const orderItems = cart.map((line) => ({
      productId: line.product.id,
      productName: line.product.name,
      color: line.product.color,
      quantity: line.quantity,
      unitPrice: line.product.salePrice,
      lineTotal: line.product.salePrice * line.quantity,
    }));

    // calcular secuencia desde configuración
    let nextSequence = 1;
    try {
      const cfg = getTicketsConfig();
      nextSequence = Math.max(1, Number(cfg.order.nextNumber) || 1);
      const updated = { ...cfg, order: { ...cfg.order, nextNumber: nextSequence + 1 } };
      saveTicketsConfig(updated);
    } catch {
      const existing = loadStoredSalesOrders();
      const maxSeq = existing.reduce((max, o) => Math.max(max, o.sequence ?? 0), 0);
      nextSequence = maxSeq > 0 ? maxSeq + 1 : existing.length + 1;
    }

    const order: SalesOrder = {
      id: uid(),
      kind: "sales-order",
      performedByUsername: user.username,
      performedByRole: user.role,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientDocumentId: selectedClient.documentId,
      clientPhone: selectedClient.phone,
      deliveryAddress: normalizedAddress,
      paymentMethod,
      sequence: nextSequence,
      subtotal,
      discount: discountAmount,
      total,
      notes: notes.trim(),
      createdAt,
      items: orderItems,
    };

  persistSalesOrder(order);
  const attendedBy = user ? `${user.username} - ${getRoleLabel(user.role)}` : undefined;
  const ticketGenerated = await downloadOrderTicket(order, attendedBy);

    setFormError(null);
    resetOrder();
    setFeedback(
      ticketGenerated
        ? "Orden de venta guardada y ticket descargado."
        : "Orden de venta guardada, pero no se pudo descargar el ticket automáticamente.",
    );
    try {
      if (ticketGenerated) {
        notify({
          title: "Orden de venta generada",
          message: `Total ${formatBs(total)}. Ticket descargado.`,
          variant: "success",
        });
      } else {
        notify({
          title: "Orden de venta generada",
          message: `Total ${formatBs(total)}. No se pudo descargar el ticket automáticamente.`,
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
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
            Orden de Venta
          </p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">
            Arma pedidos con información centralizada
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Selecciona a tus clientes, añade productos disponibles y deja listo el detalle para registrar la venta.
          </p>
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
                    onChange={(event) => setClientSearch(event.target.value)}
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
                    onChange={(event) => setProductSearch(event.target.value)}
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
                Agrega productos para comenzar a armar la orden.
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
                            ref={(element) => {
                              quantityInputRefs.current[line.product.id] = element;
                            }}
                            value={line.quantity}
                            onChange={(event) => handleUpdateQuantity(line.product.id, Number.parseInt(event.target.value, 10) || 1)}
                            onBlur={(event) => {
                              const parsed = Number.parseInt(event.target.value, 10);
                              if (Number.isNaN(parsed)) {
                                handleUpdateQuantity(line.product.id, 1);
                              }
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
                      <span className="text-xs text-slate-400">
                        Stock restante: {line.product.stock - line.quantity}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">
                        {formatBs(line.product.salePrice * line.quantity)}
                      </span>
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
                    onChange={(event) => setDiscount(event.target.value)}
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
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Dirección de entrega u observaciones"
                  rows={3}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs text-slate-400">
                Método de pago
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
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
                  onChange={(event) => setNotes(event.target.value)}
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
              <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {formError}
              </p>
            ) : null}

            {feedback ? (
              <p className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {feedback}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 transition hover:opacity-95"
              >
                Generar orden de venta
              </button>
              <button
                type="button"
                onClick={resetOrder}
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
          onSubmit={(event) => {
            event.preventDefault();
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
              onChange={(event) => {
                setQuickClient((prev) => ({ ...prev, name: event.target.value }));
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
              onChange={(event) => {
                setQuickClient((prev) => ({ ...prev, documentId: event.target.value.toUpperCase() }));
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
              onChange={(event) => {
                setQuickClient((prev) => ({ ...prev, phone: event.target.value }));
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
              onChange={(event) => {
                setQuickClient((prev) => ({ ...prev, address: event.target.value }));
                setQuickClientError(null);
              }}
              placeholder="Ej. Calle Las Flores #55, Zona Norte"
              rows={3}
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
            />
          </label>

          {quickClientError ? (
            <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {quickClientError}
            </p>
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
