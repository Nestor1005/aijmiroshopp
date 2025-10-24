export type ProductImage = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

export type Product = {
  id: string;
  name: string;
  color: string;
  stock: number;
  cost: number;
  salePrice: number;
  image: ProductImage | null;
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

export const SALES_ORDER_PAYMENT_METHODS = [
  "Efectivo",
  "QR",
  "Transferencia",
  "Otro",
] as const;

export type SalesOrderPaymentMethod = (typeof SALES_ORDER_PAYMENT_METHODS)[number];

export type SalesOrderItem = {
  productId: string;
  productName: string;
  color: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SalesOrder = {
  id: string;
  /**
   * Origen del registro para el Historial.
   * "sales-order": creado desde el módulo Orden de Venta.
   * "sale": creado desde el módulo Registrar Venta.
   * Opcional para compatibilidad con registros existentes.
   */
  kind?: "sales-order" | "sale";
  /** Usuario que registró la orden/venta */
  performedByUsername?: string;
  /** Rol del usuario que registró (admin|operator) */
  performedByRole?: "admin" | "operator";
  clientId: string;
  clientName: string;
  clientDocumentId: string;
  clientPhone: string;
  deliveryAddress: string;
  paymentMethod: SalesOrderPaymentMethod;
  sequence?: number;
  subtotal: number;
  discount: number;
  total: number;
  notes: string;
  createdAt: string;
  items: SalesOrderItem[];
};

export const SAMPLE_PRODUCTS: Product[] = [
  {
    id: "demo-1",
    name: "Camisa Inteligente AIJ",
    color: "Azul",
    stock: 25,
    cost: 120,
    salePrice: 210,
    image: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    name: "Zapatillas Quantum",
    color: "Negro",
    stock: 12,
    cost: 340,
    salePrice: 520,
    image: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-3",
    name: "Smartwatch Aurora",
    color: "Plateado",
    stock: 7,
    cost: 450,
    salePrice: 720,
    image: null,
    createdAt: new Date().toISOString(),
  },
];

export const SAMPLE_CLIENTS: Client[] = [
  {
    id: "demo-client-1",
    name: "María Fernanda López",
    documentId: "7896543 LP",
    phone: "+591 765-43210",
    address: "Av. Busch #234, La Paz",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-client-2",
    name: "Carlos Rodríguez",
    documentId: "4567891 CB",
    phone: "+591 712-34567",
    address: "Calle Warnes #118, Cochabamba",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-client-3",
    name: "Sofía Andrade",
    documentId: "9876541 SC",
    phone: "+591 763-89012",
    address: "Zona Equipetrol, Santa Cruz",
    createdAt: new Date().toISOString(),
  },
];
