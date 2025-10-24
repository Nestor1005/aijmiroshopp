import { USERS_STORAGE_KEY, TICKETS_CONFIG_STORAGE_KEY } from "./storage";

export type OperatorUser = {
  id: string;
  username: string;
  password: string;
  active: boolean;
};

export type UsersConfig = {
  admin: { username: string; password: string };
  operators: OperatorUser[];
};

export const DEFAULT_USERS_CONFIG: UsersConfig = {
  admin: { username: "Anahi", password: "12345" },
  operators: [
    { id: "op-1", username: "Operador", password: "12345", active: true },
  ],
};

export type TicketSideConfig = {
  nextNumber: number; // siguiente correlativo a asignar
  farewell: string;   // mensaje final
};

export type TicketsConfig = {
  companyName: string;
  subtitle: string;
  sale: TicketSideConfig; // Registrar Venta
  order: TicketSideConfig; // Orden de Venta
};

export const DEFAULT_TICKETS_CONFIG: TicketsConfig = {
  companyName: "AIJMIROSHOP",
  subtitle: "Sistema de Gestión de Inventario",
  sale: { nextNumber: 1, farewell: "¡Gracias por su compra!" },
  order: { nextNumber: 1, farewell: "¡Gracias por su preferencia!" },
};

export function getUsersConfig(): UsersConfig {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(USERS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as UsersConfig;
      if (parsed && parsed.admin && Array.isArray(parsed.operators)) return parsed;
    }
  } catch {}
  return { ...DEFAULT_USERS_CONFIG, operators: [...DEFAULT_USERS_CONFIG.operators] };
}

export function saveUsersConfig(cfg: UsersConfig) {
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function isInitialSetupRequired(): boolean {
  try {
    const cfg = getUsersConfig();
    const needsAdmin = !cfg.admin.username || !cfg.admin.password;
    return needsAdmin;
  } catch {
    return true;
  }
}

export function getTicketsConfig(): TicketsConfig {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(TICKETS_CONFIG_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as TicketsConfig;
      if (parsed && parsed.companyName && parsed.subtitle && parsed.sale && parsed.order) return parsed;
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_TICKETS_CONFIG)) as TicketsConfig;
}

export function saveTicketsConfig(cfg: TicketsConfig) {
  try {
    window.localStorage.setItem(TICKETS_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}
