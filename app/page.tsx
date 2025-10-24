'use client';

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ROLE_OPTIONS,
  useAuth,
  type Role,
} from "@/lib/auth-context";
import { getUsersConfig, saveUsersConfig, type UsersConfig } from "@/lib/settings";

type FormState = {
  username: string;
  password: string;
  role: Role;
};

const INITIAL_FORM_STATE: FormState = {
  username: "",
  password: "",
  role: "admin",
};

export default function Home() {
  const router = useRouter();
  const { user, login, isHydrated } = useAuth();

  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupMode, setSetupMode] = useState<boolean>(true);
  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPassword2, setSetupPassword2] = useState("");

  useEffect(() => {
    if (isHydrated && user) {
      router.replace("/dashboard");
    }
  }, [isHydrated, user, router]);

  // Determinar modo de configuración inicial desde la nube
  useEffect(() => {
    (async () => {
      try {
        const cfg = await getUsersConfig();
        const needsAdmin = !cfg.admin.username || !cfg.admin.password;
        setSetupMode(Boolean(needsAdmin));
      } catch {
        setSetupMode(true);
      }
    })();
  }, []);

  const handleInputChange = (
    field: keyof FormState,
    value: string | Role,
  ) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

  const result = await login(formState);
    if (!result.success) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
  };

  const handleSetupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!setupUsername.trim() || !setupPassword.trim()) {
      setError("Completa usuario y contraseña del Administrador.");
      return;
    }
    if (setupPassword !== setupPassword2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
  const cfg: UsersConfig = { admin: { username: setupUsername.trim(), password: setupPassword }, operators: [] };
  await saveUsersConfig(cfg);
  const result = await login({ username: setupUsername.trim(), password: setupPassword, role: "admin" });
    if (!result.success) {
      setError(result.message);
      return;
    }
    router.push("/dashboard");
  };

  const isLoginDisabled =
    !formState.username.trim() || !formState.password.trim() || isSubmitting;

  const modules = [
    "Inventario",
    "Clientes",
    "Orden de Venta",
    "Registrar Venta",
    "Historial",
    "Reportes",
    "Ajustes",
  ];

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 px-4 pb-10 pt-8 sm:pt-10 lg:flex-row lg:items-center lg:gap-14">
  <section className="flex-1 space-y-6 text-balance">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-4 py-1 text-xs font-medium uppercase tracking-wide text-slate-300">
          Plataforma AIJMIROSHOP
        </span>
  <div className="space-y-3">
          <h1 className="text-4xl font-semibold leading-tight text-slate-100 sm:text-5xl">
            Controla tu negocio con un panel moderno y seguro.
          </h1>
          <p className="max-w-xl text-lg text-slate-300">
            Elige tu rol para ingresar al sistema. AIJMIROSHOP centraliza el
            inventario, clientes y ventas en módulos organizados, con soporte
            completo para equipos administrativos y operativos.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {modules.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 shadow-lg shadow-slate-950/40 backdrop-blur"
            >
              {item}
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          Diseñado con soporte responsivo para smartphones, tablets y equipos de
          escritorio.
        </p>
      </section>

      <section className="w-full max-w-md flex-1">
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50 backdrop-blur-sm">
          <header className="mb-6 space-y-2 text-center">
            <h2 className="text-2xl font-semibold text-slate-100">
              {setupMode ? "Configurar Administrador" : "Acceso al sistema"}
            </h2>
            <p className="text-sm text-slate-400">
              {setupMode
                ? "Primer uso: crea el usuario y contraseña del Administrador. Podrás agregar operadores luego en Ajustes."
                : "Ingresa tus credenciales según el rol asignado."}
            </p>
          </header>

          {!isHydrated ? (
            <p className="text-center text-sm text-slate-400">
              Validando sesión...
            </p>
          ) : setupMode ? (
            <form className="space-y-6" onSubmit={handleSetupSubmit}>
              <div className="grid gap-4">
                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">Usuario Administrador</span>
                  <input
                    type="text"
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    autoComplete="username"
                  />
                </label>
                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">Contraseña</span>
                  <input
                    type="password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    autoComplete="new-password"
                  />
                </label>
                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                  <input
                    type="password"
                    value={setupPassword2}
                    onChange={(e) => setSetupPassword2(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              {error ? (
                <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-900/50 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-blue-400/70"
              >
                Crear cuenta administrador
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">
                    Rol
                  </span>
                  <select
                    value={formState.role}
                    onChange={(event) =>
                      handleInputChange("role", event.target.value as Role)
                    }
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">
                    Usuario
                  </span>
                  <input
                    type="text"
                    value={formState.username}
                    onChange={(event) =>
                      handleInputChange("username", event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    autoComplete="username"
                  />
                </label>

                <label className="space-y-2 text-left">
                  <span className="text-sm font-medium text-slate-200">
                    Contraseña
                  </span>
                  <input
                    type="password"
                    value={formState.password}
                    onChange={(event) =>
                      handleInputChange("password", event.target.value)
                    }
                    placeholder="•••••"
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                    autoComplete="current-password"
                  />
                </label>
              </div>

              {error ? (
                <p className="rounded-xl border border-rose-600/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isLoginDisabled}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-900/50 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Validando..." : "Ingresar"}
              </button>
            </form>
          )}

          {/* Ejemplos de credenciales removidos por seguridad */}
        </div>
      </section>
    </main>
  );
}
