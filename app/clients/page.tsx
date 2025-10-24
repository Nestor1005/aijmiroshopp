'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  ChangeEvent,
  FormEvent,
  SVGProps,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { type Client } from "@/lib/entities";
import { isValidPhone } from "@/lib/validators";
import { useConfirm } from "@/components/confirm/provider";
import { useNotify } from "@/components/notifications/provider";
import { deleteClient, listClients, upsertClient } from "@/lib/supabase-repo";

const TABLE_HEADERS = [
  { key: "name", label: "Nombre", align: "text-left" },
  { key: "documentId", label: "Carnet de Identidad", align: "text-left" },
  { key: "phone", label: "Celular / Teléfono", align: "text-left" },
  { key: "address", label: "Dirección", align: "text-left" },
  { key: "actions", label: "Acciones", align: "text-center" },
];

const COLUMN_ALIASES: Record<string, string[]> = {
  nombre: ["nombre", "name", "clientenombre"],
  ci: ["ci", "carnet", "carnetidentidad", "documento", "dni", "documentid"],
  telefono: ["telefono", "celular", "phone", "telefonootelefono", "telefonoocelular"],
  direccion: ["direccion", "address", "direccioncliente"],
};

const REQUIRED_COLUMNS = Object.keys(COLUMN_ALIASES);
const REQUIRED_COLUMN_LABELS: Record<string, string> = {
  nombre: "nombre",
  ci: "carnetIdentidad",
  telefono: "telefono",
  direccion: "direccion",
};

const normalizeHeaderKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const getCanonicalColumn = (header: string): string | null => {
  const normalized = normalizeHeaderKey(header);

  for (const [canonical, variants] of Object.entries(COLUMN_ALIASES)) {
    if (variants.some((variant) => normalizeHeaderKey(variant) === normalized)) {
      return canonical;
    }
  }

  return null;
};

const buildWorkbookFromRows = (rows: string[][], sheetName: string) => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
};

const downloadWorkbook = (rows: string[][], filename: string, sheetName = "Clientes") => {
  const workbook = buildWorkbookFromRows(rows, sheetName);
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const PencilIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m15.232 5.232 3.536 3.536m-2.036 6.036-9 3a1 1 0 0 1-1.27-1.27l3-9a1 1 0 0 1 .238-.382l6-6a2.121 2.121 0 1 1 3 3l-6 6a1 1 0 0 1-.382.238l-2.707.902.902-2.707a1 1 0 0 1 .238-.382"
    />
  </svg>
);

const EyeIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5s8.577 3.01 9.964 7.178a1 1 0 0 1 0 .644C20.577 16.49 16.64 19.5 12 19.5S3.423 16.49 2.036 12.322z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
  </svg>
);

const TrashIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.75 9.75v7.5m4.5-7.5v7.5M4.5 6.75h15M9 6.75V5.25A1.5 1.5 0 0 1 10.5 3.75h3A1.5 1.5 0 0 1 15 5.25v1.5m3 0v12a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-12"
    />
  </svg>
);

type ClientFormState = {
  name: string;
  documentId: string;
  phone: string;
  address: string;
};

const INITIAL_FORM_STATE: ClientFormState = {
  name: "",
  documentId: "",
  phone: "",
  address: "",
};

const PAGE_SIZE_OPTIONS = [5, 10, 50];

export default function ClientsPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuth();
  const confirm = useConfirm();
  const notify = useNotify();

  const [clients, setClients] = useState<Client[]>([]);
  const [hasLoadedClients, setHasLoadedClients] = useState(false);
  const [formState, setFormState] = useState<ClientFormState>(INITIAL_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!user) {
      router.replace("/");
      return;
    }

    if (user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [isHydrated, user, router]);

  useEffect(() => {
    if (!isHydrated || !user || user.role !== "admin" || hasLoadedClients) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await listClients();
        if (!cancelled) {
          // Map repo Client to UI Client shape (already aligned)
          setClients(
            rows.map((c) => ({
              id: c.id,
              name: c.name,
              documentId: c.documentId,
              phone: c.phone,
              address: c.address,
              createdAt: c.createdAt,
            })),
          );
        }
      } catch (err) {
        console.error("Error cargando clientes desde la nube", err);
        try { notify({ title: "Error", message: "No se pudieron cargar los clientes.", variant: "error" }); } catch {}
        setFormError("No se pudieron cargar los clientes desde la nube.");
      } finally {
        if (!cancelled) setHasLoadedClients(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasLoadedClients, isHydrated, user, notify]);

  useEffect(() => {
    if (!selectedClient) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedClient(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedClient]);

  useEffect(() => {
    if (!editingClient) {
      return;
    }

    setFormState({
      name: editingClient.name,
      documentId: editingClient.documentId,
      phone: editingClient.phone,
      address: editingClient.address,
    });
    setFeedback(null);
    setFormError(null);

    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const timeoutId = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editingClient]);

  const filteredClients = useMemo(() => {
    if (!searchTerm) {
      return clients;
    }

    const lowered = searchTerm.toLowerCase();
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(lowered) ||
        client.documentId.toLowerCase().includes(lowered) ||
        client.phone.toLowerCase().includes(lowered) ||
        client.address.toLowerCase().includes(lowered),
    );
  }, [clients, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const resetForm = () => {
    setFormState(INITIAL_FORM_STATE);
    setFormError(null);
    setFeedback(null);
    setEditingClient(null);
  };

  const handleInputChange = (field: keyof ClientFormState, value: string) => {
    setFormError(null);
    setFeedback(null);
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFeedback(null);

    if (!formState.name.trim() || !formState.documentId.trim() || !formState.address.trim()) {
      setFormError("Completa todos los campos obligatorios.");
      return;
    }

  if (!isValidPhone(formState.phone)) {
      setFormError("Ingresa un número de teléfono válido (7 a 15 dígitos).");
      return;
    }

    const normalizedName = formState.name.trim();
    const normalizedDocumentId = formState.documentId.trim();
    const normalizedPhone = formState.phone.trim();
    const normalizedAddress = formState.address.trim();

    try {
      if (editingClient) {
        const saved = await upsertClient({
          id: editingClient.id,
          name: normalizedName,
          documentId: normalizedDocumentId,
          phone: normalizedPhone,
          address: normalizedAddress,
        });
        const updatedClient: Client = {
          id: saved.id,
          name: saved.name,
          documentId: saved.documentId,
          phone: saved.phone,
          address: saved.address,
          createdAt: saved.createdAt,
        };
        setClients((prev) => prev.map((c) => (c.id === editingClient.id ? updatedClient : c)));
        if (selectedClient?.id === editingClient.id) {
          setSelectedClient(updatedClient);
        }
        resetForm();
        setFeedback(`Cliente "${updatedClient.name}" actualizado.`);
        try { notify({ title: "Cliente actualizado", message: updatedClient.name, variant: "success" }); } catch {}
      } else {
        const saved = await upsertClient({
          name: normalizedName,
          documentId: normalizedDocumentId,
          phone: normalizedPhone,
          address: normalizedAddress,
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
        resetForm();
        setFeedback(`Cliente "${newClient.name}" agregado.`);
        try { notify({ title: "Cliente agregado", message: newClient.name, variant: "success" }); } catch {}
      }
    } catch (err) {
      console.error("Error guardando cliente", err);
      setFormError("No se pudo guardar el cliente en la nube.");
      try { notify({ title: "Error", message: "No se pudo guardar el cliente.", variant: "error" }); } catch {}
    }
  };

  const handleClearClients = async () => {
    if (clients.length === 0) {
      return;
    }
    const confirmClear = await confirm({
      title: "Vaciar clientes",
      message: "¿Seguro que deseas vaciar la lista de clientes? Esta acción eliminará todos los registros.",
      confirmText: "Vaciar",
      cancelText: "Cancelar",
      intent: "danger",
    });

    if (confirmClear) {
      try {
        // Bulk delete in serial to avoid rate-limits; adjust if needed
        for (const c of clients) {
          await deleteClient(c.id);
        }
        setClients([]);
        setSelectedClient(null);
        setPage(1);
        resetForm();
        setFeedback("Clientes eliminados correctamente.");
        try { notify({ title: "Clientes vaciados", message: "Se eliminaron todos los clientes.", variant: "success" }); } catch {}
      } catch (err) {
        console.error("Error al vaciar clientes", err);
        setFormError("No se pudieron eliminar todos los clientes en la nube.");
        try { notify({ title: "Error", message: "No se pudieron eliminar todos los clientes.", variant: "error" }); } catch {}
      }
    }
  };

  const handleImportClick = () => {
    setFormError(null);
    setFeedback(null);

    if (importInputRef.current) {
      importInputRef.current.value = "";
      importInputRef.current.click();
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFormError(null);
    setFeedback(null);

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFormError("El archivo debe tener extensión .xlsx.");
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        setFormError("El archivo no contiene hojas para procesar.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: "",
        raw: true,
      });

      if (rawRows.length < 2) {
        setFormError("El archivo debe incluir encabezado y al menos una fila de datos.");
        return;
      }

      const headerRow = rawRows[0].map((cell) => String(cell ?? ""));
      const headerMap = new Map<string, number>();

      headerRow.forEach((header, index) => {
        const canonical = getCanonicalColumn(header);
        if (canonical && !headerMap.has(canonical)) {
          headerMap.set(canonical, index);
        }
      });

      const missingColumns = REQUIRED_COLUMNS.filter((column) => !headerMap.has(column));
      if (missingColumns.length > 0) {
        setFormError(
          `Faltan columnas requeridas: ${missingColumns
            .map((column) => REQUIRED_COLUMN_LABELS[column] ?? column)
            .join(", ")}`,
        );
        return;
      }

  const importedClients: Array<{ name: string; documentId: string; phone: string; address: string }> = [];
      const issues: string[] = [];

      rawRows.slice(1).forEach((rowValues, rowIndex) => {
        const normalizedValues = rowValues.map((value) => {
          if (value === null || value === undefined) {
            return "";
          }

          if (typeof value === "number") {
            return Number.isFinite(value) ? value.toString() : "";
          }

          return String(value).trim();
        });

        if (normalizedValues.every((cell) => cell === "")) {
          return;
        }

        const getCell = (key: string) => {
          const columnIndex = headerMap.get(key);
          if (columnIndex === undefined) {
            return "";
          }

          return normalizedValues[columnIndex] ?? "";
        };

        const name = getCell("nombre");
        const documentId = getCell("ci");
        const phone = getCell("telefono");
        const address = getCell("direccion");

        const lineNumber = rowIndex + 2;

        if (!name || !documentId || !address) {
          issues.push(`Fila ${lineNumber}: faltan campos obligatorios.`);
          return;
        }

  if (!isValidPhone(phone)) {
          issues.push(`Fila ${lineNumber}: teléfono inválido.`);
          return;
        }

        importedClients.push({
          name,
          documentId,
          phone,
          address,
        });
      });

      if (importedClients.length > 0) {
        try {
          const results = await Promise.all(
            importedClients.map((c) =>
              upsertClient({
                name: c.name,
                documentId: c.documentId,
                phone: c.phone,
                address: c.address,
              }),
            ),
          );
          const created: Client[] = results.map((r) => ({
            id: r.id,
            name: r.name,
            documentId: r.documentId,
            phone: r.phone,
            address: r.address,
            createdAt: r.createdAt,
          }));
          setClients((prev) => [...created, ...prev]);
          setPage(1);
          setFeedback(
            `${created.length} cliente${created.length === 1 ? "" : "s"} importado${
              created.length === 1 ? "" : "s"
            } correctamente.`,
          );
          try { notify({ title: "Importación completa", message: `${created.length} clientes`, variant: "success" }); } catch {}
        } catch (err) {
          console.error("Error importando clientes", err);
          setFormError("Ocurrió un error importando clientes a la nube.");
          try { notify({ title: "Error", message: "No se pudieron importar algunos clientes.", variant: "error" }); } catch {}
        }
      }

      if (issues.length > 0) {
        const detail = issues.slice(0, 3).join(" ");
        const remaining =
          issues.length > 3 ? ` Se omitieron ${issues.length - 3} fila(s) adicionales.` : "";
        setFormError(`Algunas filas no se importaron. ${detail}${remaining}`);
      } else if (importedClients.length === 0) {
        setFormError("No se pudo importar ninguna fila. Verifica el contenido del archivo.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo procesar el archivo.");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const handleExport = () => {
    setFormError(null);
    setFeedback(null);

    if (clients.length === 0) {
      setFormError("No hay clientes para exportar.");
      return;
    }

    const rows = [
      ["nombre", "carnetIdentidad", "telefono", "direccion", "fechaRegistro"],
      ...clients.map((client) => [
        client.name,
        client.documentId,
        client.phone,
        client.address,
        new Date(client.createdAt).toLocaleString("es-BO", {
          dateStyle: "long",
          timeStyle: "medium",
          timeZone: "America/La_Paz",
        }),
      ]),
    ];

    const filename = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadWorkbook(rows, filename);
    setFeedback("Clientes exportados en formato XLSX.");
  };

  const handleDownloadTemplate = () => {
    setFormError(null);
    setFeedback(null);

    const rows = [
      ["nombre", "carnetIdentidad", "telefono", "direccion"],
      ["Juan Pérez", "1234567 LP", "+591 70000000", "Av. Siempre Viva 742"],
    ];

    downloadWorkbook(rows, "formato-clientes.xlsx", "Plantilla");
    setFeedback("Plantilla descargada en formato XLSX.");
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(null);
    setFeedback(null);
    setFormError(null);
    setEditingClient(client);
  };

  const handleViewClient = (client: Client) => {
    setFormError(null);
    setFeedback(null);
    setSelectedClient(client);
  };

  const handleDeleteClient = async (clientId: string) => {
    const target = clients.find((client) => client.id === clientId);
    if (!target) {
      return;
    }

    const confirmed = await confirm({
      title: "Eliminar cliente",
      message: `¿Eliminar a "${target.name}" de la lista?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      intent: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteClient(clientId);
      const nextClients = clients.filter((client) => client.id !== clientId);
      setClients(nextClients);

      if (editingClient?.id === clientId) {
        resetForm();
      } else {
        setFormError(null);
      }

      const nextTotalPages = Math.max(1, Math.ceil(nextClients.length / pageSize));
      if (page > nextTotalPages) {
        setPage(nextTotalPages);
      }

      if (selectedClient?.id === clientId) {
        setSelectedClient(null);
      }

      setFeedback(`Cliente "${target.name}" eliminado.`);
      try { notify({ title: "Cliente eliminado", message: `Se eliminó ${target.name}.`, variant: "success" }); } catch {}
    } catch (err) {
      console.error("Error eliminando cliente", err);
      setFormError("No se pudo eliminar el cliente en la nube.");
      try { notify({ title: "Error", message: "No se pudo eliminar el cliente.", variant: "error" }); } catch {}
    }
  };

  const pageNumbers = useMemo(() => {
    const numbers: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let index = start; index <= end; index += 1) {
      numbers.push(index);
    }

    return numbers;
  }, [currentPage, totalPages]);

  if (!isHydrated || !user || user.role !== "admin") {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-slate-400">
        Validando permisos...
      </main>
    );
  }

  return (
  <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-10 sm:gap-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/40 backdrop-blur lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
            Clientes AIJMIROSHOP
          </p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">
            Administra tus relaciones comerciales
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Registra nuevos clientes, importa tus listas existentes y consulta sus datos de contacto desde cualquier dispositivo.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
        >
          Volver al dashboard
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <form
          ref={formRef}
          className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30"
          onSubmit={handleSubmit}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {editingClient ? "Editar cliente" : "Registrar cliente"}
              </h2>
              {editingClient ? (
                <p className="text-xs text-slate-400">
                  Modificando: <span className="text-slate-200">{editingClient.name}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-400 underline underline-offset-4 transition hover:text-slate-200"
            >
              Limpiar formulario
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Nombre del cliente *</span>
              <input
                ref={nameInputRef}
                required
                value={formState.name}
                onChange={(event) => handleInputChange("name", event.target.value)}
                placeholder="Ej. Ana María"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Carnet de identidad *</span>
              <input
                required
                value={formState.documentId}
                onChange={(event) => handleInputChange("documentId", event.target.value.toUpperCase())}
                placeholder="Ej. 1234567 LP"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Celular o Teléfono *</span>
              <input
                required
                value={formState.phone}
                onChange={(event) => handleInputChange("phone", event.target.value)}
                placeholder="Ej. +591 70000000"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-200">Dirección *</span>
              <textarea
                required
                value={formState.address}
                onChange={(event) => handleInputChange("address", event.target.value)}
                placeholder="Ej. Calle Principal #123, Zona Centro"
                rows={3}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>
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

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/50 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-blue-400/70"
            >
              {editingClient ? "Actualizar cliente" : "Guardar cliente"}
            </button>
            <button
              type="button"
              onClick={handleClearClients}
              className="inline-flex items-center justify-center rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20"
            >
              Vaciar clientes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={handleImportClick}
              className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Importar (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Exportar (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 font-medium text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
            >
              Descargar formato (.xlsx)
            </button>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportFile}
          />
        </form>

        <aside className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Lista de clientes</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                Mostrar
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number.parseInt(event.target.value, 10));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                filas
              </label>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Buscar</span>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2">
              <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
              </svg>
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Nombre, CI, teléfono o dirección"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </label>

          {/* Desktop/tablet table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-950/50 shadow-inner shadow-slate-950/40 md:block">
            <div className="max-h-[24rem] overflow-y-auto lg:max-h-[34rem]">
              <table className="min-w-[840px] w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                  <tr>
                    {TABLE_HEADERS.map(({ key, label, align }) => (
                      <th
                        key={key}
                        className={`border-b border-slate-800/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 ${align}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedClients.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_HEADERS.length} className="px-4 py-10 text-center text-sm text-slate-400">
                        {clients.length === 0
                          ? "No hay clientes registrados. Agrega uno para comenzar."
                          : "Ningún cliente coincide con la búsqueda."}
                      </td>
                    </tr>
                  ) : (
                    paginatedClients.map((client) => (
                      <tr key={client.id} className="border-b border-slate-800/40">
                        <td className="px-4 py-3 font-medium text-slate-200">{client.name}</td>
                        <td className="px-4 py-3 text-slate-300">{client.documentId}</td>
                        <td className="px-4 py-3 text-slate-300">{client.phone}</td>
                        <td className="px-4 py-3 text-slate-300">{client.address}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditClient(client)}
                              className="inline-flex items-center justify-center rounded-lg border border-sky-500/60 bg-sky-500/10 p-2 text-sky-200 transition hover:bg-sky-500/20"
                              title="Editar"
                              aria-label={`Editar ${client.name}`}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewClient(client)}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/70 p-2 text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
                              title="Ver detalles"
                              aria-label={`Ver detalles de ${client.name}`}
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(client.id)}
                              className="inline-flex items-center justify-center rounded-lg border border-rose-500/60 bg-rose-500/10 p-2 text-rose-200 transition hover:bg-rose-500/20"
                              title="Eliminar"
                              aria-label={`Eliminar ${client.name}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile list cards */}
          <div className="block space-y-3 md:hidden">
            {paginatedClients.length === 0 ? (
              <p className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
                {clients.length === 0
                  ? "No hay clientes registrados. Agrega uno para comenzar."
                  : "Ningún cliente coincide con la búsqueda."}
              </p>
            ) : (
              paginatedClients.map((client) => (
                <article key={client.id} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 shadow-inner shadow-slate-950/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-100">{client.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-400">CI: {client.documentId}</p>
                      <p className="text-xs text-slate-400">{client.phone}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-300">{client.address}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditClient(client)}
                      className="inline-flex items-center justify-center rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewClient(client)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClient(client.id)}
                      className="inline-flex items-center justify-center rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex flex-col gap-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Mostrando {paginatedClients.length} de {filteredClients.length} clientes
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-800/60 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-sky-500/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    pageNumber === currentPage
                      ? "bg-sky-500 text-white shadow-lg shadow-sky-900/40"
                      : "border border-slate-800/60 text-slate-200 hover:border-sky-500/70"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-800/60 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-sky-500/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </aside>
      </section>

      {selectedClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedClient(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-details-title"
            className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="client-details-title" className="text-xl font-semibold text-slate-100">
                  {selectedClient.name}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">Detalle del cliente</p>
                <p className="mt-2 text-sm text-slate-400">
                  Registrado el {new Date(selectedClient.createdAt).toLocaleString("es-BO", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500/70 hover:text-sky-200"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 space-y-4 text-sm text-slate-200">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Carnet de identidad</span>
                <p className="mt-1 text-base text-slate-100">{selectedClient.documentId}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Celular o teléfono</span>
                <p className="mt-1 text-base text-slate-100">{selectedClient.phone}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Dirección</span>
                <p className="mt-1 text-base text-slate-100">{selectedClient.address}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
