import { getSupabaseClient } from "./supabase-client";
import { uid } from "./id";

export type ProductImage = { name: string; size: number; type: string; dataUrl: string } | null;
export type Product = {
  id: string;
  name: string;
  color: string;
  stock: number;
  cost: number;
  salePrice: number;
  image: ProductImage;
  createdAt: string;
};

export type Client = {
  id: string;
  name: string;
  documentId: string;
  phone: string;
  address: string;
  createdAt: string;
};

export type OrderKind = "sale" | "sales-order";
export type PaymentMethod = "efectivo" | "pago-movil" | "zelle" | "transferencia" | string;

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name?: string | null;
  color?: string | null;
  qty: number;
  unit_price: number;
  subtotal: number;
};

export type Order = {
  id: string;
  kind: OrderKind;
  total: number;
  payment_method?: PaymentMethod;
  performed_by_username?: string;
  performed_by_role?: "admin" | "operator";
  // Client snapshot + logistics
  client_id?: string | null;
  client_name?: string | null;
  client_document_id?: string | null;
  client_phone?: string | null;
  delivery_address?: string | null;
  // Amounts breakdown
  subtotal?: number;
  discount?: number;
  notes?: string | null;
  // System fields
  sequence?: number;
  created_at?: string;
  items?: OrderItem[];
};

// Settings KV
export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return fallback as T;
  return (data.value as T) ?? (fallback as T);
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

// Products
export async function listProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,color,stock,cost,sale_price,image,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  type ProductRow = {
    id: string;
    name: string;
    color: string;
    stock: number;
    cost: number;
    sale_price: number;
    image: ProductImage;
    created_at: string;
  };
  return ((data ?? []) as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    stock: row.stock,
    cost: Number(row.cost ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    image: row.image ?? null,
    createdAt: row.created_at,
  }));
}

export async function upsertProduct(p: Omit<Product, "id" | "createdAt"> & { id?: string }): Promise<Product> {
  const supabase = getSupabaseClient();
  const id = p.id ?? uid();
  const payload = {
    id,
    name: p.name,
    color: p.color,
    stock: p.stock,
    cost: p.cost,
    sale_price: p.salePrice,
    image: p.image ?? null,
  };
  const { data, error } = await supabase
    .from("products")
    .upsert(payload)
    .select("id,name,color,stock,cost,sale_price,image,created_at")
    .maybeSingle();
  if (error) throw error;
  type ProductRow = {
    id: string;
    name: string;
    color: string;
    stock: number;
    cost: number;
    sale_price: number;
    image: ProductImage;
    created_at: string;
  };
  const row = data as ProductRow;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    stock: row.stock,
    cost: Number(row.cost ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    image: row.image ?? null,
    createdAt: row.created_at,
  };
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// Clients
export async function listClients(): Promise<Client[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,document_id,phone,address,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  type ClientRow = {
    id: string;
    name: string;
    document_id: string;
    phone: string | null;
    address: string | null;
    created_at: string;
  };
  return ((data ?? []) as ClientRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    documentId: row.document_id,
    phone: row.phone ?? "",
    address: row.address ?? "",
    createdAt: row.created_at,
  })) as Client[];
}

export async function upsertClient(c: Omit<Client, "id" | "createdAt"> & { id?: string }): Promise<Client> {
  const supabase = getSupabaseClient();
  const id = c.id ?? uid();
  const payload = {
    id,
    name: c.name,
    document_id: c.documentId,
    phone: c.phone,
    address: c.address,
  };
  const { data, error } = await supabase
    .from("clients")
    .upsert(payload)
    .select("id,name,document_id,phone,address,created_at")
    .maybeSingle();
  if (error) throw error;
  type ClientRow = {
    id: string;
    name: string;
    document_id: string;
    phone: string | null;
    address: string | null;
    created_at: string;
  };
  const row = data as ClientRow;
  return {
    id: row.id,
    name: row.name,
    documentId: row.document_id,
    phone: row.phone ?? "",
    address: row.address ?? "",
    createdAt: row.created_at,
  } as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// Orders
export async function listOrders(): Promise<Order[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  type OrderItemRow = {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name?: string | null;
    color?: string | null;
    qty: number;
    unit_price: number;
    subtotal: number;
  };
  type OrderRow = {
    id: string;
    kind: OrderKind;
    total: number;
    payment_method?: PaymentMethod;
    performed_by_username?: string;
    performed_by_role?: "admin" | "operator";
    client_id?: string | null;
    client_name?: string | null;
    client_document_id?: string | null;
    client_phone?: string | null;
    delivery_address?: string | null;
    subtotal?: number;
    discount?: number;
    notes?: string | null;
    sequence?: number;
    created_at?: string;
    items?: OrderItemRow[];
  };
  return ((data ?? []) as OrderRow[]).map((o) => ({ ...o, items: o.items })) as Order[];
}

export async function createOrder(order: Omit<Order, "id" | "sequence" | "created_at" | "items"> & { items: Array<Omit<OrderItem, "id" | "order_id">> }): Promise<Order> {
  const supabase = getSupabaseClient();
  const orderId = uid();

  // Insert order
  const orderPayload = {
    id: orderId,
    kind: order.kind,
    total: order.total,
    payment_method: order.payment_method ?? undefined,
    performed_by_username: order.performed_by_username ?? undefined,
    performed_by_role: order.performed_by_role ?? undefined,
    client_id: order.client_id ?? undefined,
    client_name: order.client_name ?? undefined,
    client_document_id: order.client_document_id ?? undefined,
    client_phone: order.client_phone ?? undefined,
    delivery_address: order.delivery_address ?? undefined,
    subtotal: order.subtotal ?? undefined,
    discount: order.discount ?? undefined,
    notes: order.notes ?? undefined,
  } satisfies Partial<Order> & { id: string };

  const { data: createdOrderRow, error: errOrder } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select("*")
    .maybeSingle();
  if (errOrder) throw errOrder;

  // Insert items
  const itemsPayload = order.items.map((it) => ({
    id: uid(),
    order_id: orderId,
    product_id: it.product_id ?? null,
    product_name: it.product_name ?? null,
    color: it.color ?? null,
    qty: it.qty,
    unit_price: it.unit_price,
    subtotal: it.subtotal,
  }));
  const { error: errItems } = await supabase.from("order_items").insert(itemsPayload);
  if (errItems) throw errItems;

  // If it's a sale, decrement stock
  if (order.kind === "sale") {
    for (const it of order.items) {
      const { data: prod, error: errFetch } = await supabase
        .from("products")
        .select("stock")
        .eq("id", it.product_id as string)
        .maybeSingle();
      if (errFetch) throw errFetch;
      const current = (prod?.stock ?? 0) as number;
      const next = Math.max(0, current - it.qty);
      const { error: errUpd } = await supabase.from("products").update({ stock: next }).eq("id", it.product_id as string);
      if (errUpd) throw errUpd;
    }
  }

  // Return composed order (include sequence and created_at from DB)
  const created: Order = {
    ...(createdOrderRow as Partial<Order>),
    id: orderId,
    kind: order.kind,
    total: order.total,
    payment_method: order.payment_method,
    performed_by_username: order.performed_by_username,
    performed_by_role: order.performed_by_role,
    client_id: order.client_id,
    client_name: order.client_name,
    client_document_id: order.client_document_id,
    client_phone: order.client_phone,
    delivery_address: order.delivery_address,
    subtotal: order.subtotal,
    discount: order.discount,
    notes: order.notes,
    items: itemsPayload as OrderItem[],
  };
  return created;
}

// Delete a single order (order_items will cascade)
export async function deleteOrder(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

// Clear all orders (and cascading items)
export async function clearOrders(): Promise<void> {
  const supabase = getSupabaseClient();
  // Supabase requires a filter; delete everything older than a future date
  const { error } = await supabase
    .from("orders")
    .delete()
    .gt("created_at", "1970-01-01T00:00:00Z");
  if (error) throw error;
}

// Convenience helpers for app
export async function getLowStockThreshold(): Promise<number> {
  const n = await getSetting<number>("low-stock-threshold", 5);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}

export async function setLowStockThreshold(n: number): Promise<void> {
  const val = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  await setSetting("low-stock-threshold", val);
}

export type UsersConfig = {
  admin: { username: string; password: string };
  operators: Array<{ id: string; username: string; password: string; active: boolean }>;
};

export async function getUsersConfigRemote(): Promise<UsersConfig | null> {
  return getSetting<UsersConfig | null>("users", null);
}

export async function saveUsersConfigRemote(cfg: UsersConfig): Promise<void> {
  await setSetting<UsersConfig>("users", cfg);
}

export async function getTicketsConfigRemote<T = unknown>(): Promise<T | null> {
  return getSetting<T | null>("tickets-config", null);
}

export async function saveTicketsConfigRemote<T = unknown>(cfg: T): Promise<void> {
  await setSetting<T>("tickets-config", cfg);
}
