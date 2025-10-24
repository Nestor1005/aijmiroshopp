import {
  getUsersConfigRemote,
  saveUsersConfigRemote,
  getTicketsConfigRemote,
  saveTicketsConfigRemote,
} from "./supabase-repo";

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

// Cloud-first defaults (no demo credentials). First-run setup will prompt admin creation.
export const DEFAULT_USERS_CONFIG: UsersConfig = {
  admin: { username: "", password: "" },
  operators: [],
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

// Cloud-backed helpers (async)
export async function getUsersConfig(): Promise<UsersConfig> {
  try {
    const remote = await getUsersConfigRemote();
    if (remote && remote.admin && Array.isArray(remote.operators)) return remote;
  } catch {}
  return { ...DEFAULT_USERS_CONFIG, operators: [...DEFAULT_USERS_CONFIG.operators] };
}

export async function saveUsersConfig(cfg: UsersConfig): Promise<void> {
  await saveUsersConfigRemote(cfg);
}

export async function isInitialSetupRequired(): Promise<boolean> {
  try {
    const cfg = await getUsersConfig();
    return !cfg.admin.username || !cfg.admin.password;
  } catch {
    return true;
  }
}

export async function getTicketsConfig(): Promise<TicketsConfig> {
  try {
    const remote = await getTicketsConfigRemote<TicketsConfig>();
    if (remote && (remote as TicketsConfig).companyName) return remote as TicketsConfig;
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_TICKETS_CONFIG)) as TicketsConfig;
}

export async function saveTicketsConfig(cfg: TicketsConfig): Promise<void> {
  await saveTicketsConfigRemote<TicketsConfig>(cfg);
}
