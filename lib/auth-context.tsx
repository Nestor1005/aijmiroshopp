'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getUsersConfig } from "./settings";

export type Role = "admin" | "operator";

export type User = {
  username: string;
  role: Role;
};

type LoginPayload = {
  username: string;
  password: string;
  role: Role;
};

type LoginResponse =
  | { success: true; user: User }
  | { success: false; message: string };

type AuthContextValue = {
  user: User | null;
  isHydrated: boolean;
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  logout: () => void;
};


const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operador",
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Cloud-only: no sessionStorage/localStorage persistence
    const id = setTimeout(() => setIsHydrated(true), 0);
    return () => clearTimeout(id);
  }, []);

  const login = async ({ username, password, role }: LoginPayload): Promise<LoginResponse> => {
    const normalizedUsername = username.trim();
    const cfg = await getUsersConfig();

    if (role === "admin") {
      const isUserValid = normalizedUsername.toLowerCase() === cfg.admin.username.toLowerCase();
      const isPasswordValid = password === cfg.admin.password;
      if (!isUserValid || !isPasswordValid) {
        return { success: false, message: "Credenciales incorrectas. Verifica usuario, contraseña y rol." };
      }
      const authenticatedUser: User = { username: cfg.admin.username, role };
      setUser(authenticatedUser);
      return { success: true, user: authenticatedUser };
    }

    // operator role: buscar operador activo
    const op = cfg.operators.find(
      (o) => o.active && o.username.toLowerCase() === normalizedUsername.toLowerCase() && o.password === password,
    );
    if (!op) {
      return { success: false, message: "Credenciales incorrectas. Verifica usuario, contraseña y rol." };
    }
    const authenticatedUser: User = { username: op.username, role };
    setUser(authenticatedUser);
    return { success: true, user: authenticatedUser };
  };

  const logout = () => {
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      isHydrated,
      login,
      logout,
    }),
    [user, isHydrated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de un AuthProvider.");
  }
  return context;
};

export const getRoleLabel = (role: Role) => ROLE_LABELS[role];

export const ROLE_OPTIONS: { value: Role; label: string }[] = (
  Object.keys(ROLE_LABELS) as Role[]
).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));
