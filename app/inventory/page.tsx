'use client';

import Image from "next/image";
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
import { formatBs, parseBsInput } from "@/lib/currency";
import { useAuth } from "@/lib/auth-context";
import { type Product, type ProductImage } from "@/lib/entities";
import { listProducts, upsertProduct as upsertProductCloud, deleteProduct as deleteProductCloud } from "@/lib/supabase-repo";
import { useConfirm } from "@/components/confirm/provider";
import { useNotify } from "@/components/notifications/provider";

type ProductFormState = {
  name: string;
  color: string;
  stock: string;
  cost: string;
  salePrice: string;
  imageFile: File | null;
  imagePreview: string | null;
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const INITIAL_FORM_STATE: ProductFormState = {
  name: "",
  color: "",
  stock: "",
  cost: "",
  salePrice: "",
  imageFile: null,
  imagePreview: null,
};

const PAGE_SIZE_OPTIONS = [5, 10, 50];

// Cloud-only: products are loaded from Supabase; no local samples

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLUMN_ALIASES: Record<string, string[]> = {
  nombre: ["nombre", "productonombre", "name"],
  color: ["color"],
  stock: ["stock", "existencias", "cantidad"],
  costo: ["costo", "costobs", "costounitario", "costounitarioenbs"],
  precioventa: ["precioventa", "precioventabs", "preciounitario", "precio"],
};

const REQUIRED_COLUMNS = Object.keys(COLUMN_ALIASES);

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

const downloadWorkbook = (rows: string[][], filename: string, sheetName = "Inventario") => {
  const workbook = buildWorkbookFromRows(rows, sheetName);
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const parseImportAmount = (rawValue: unknown): number | null => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  const text = String(rawValue).trim();
  if (!text) {
    return null;
  }

  if (text.includes(".") && !text.includes(",")) {
    const englishValue = Number.parseFloat(text);
    if (!Number.isNaN(englishValue)) {
      return englishValue;
    }
  }

  return parseBsInput(text);
};

const TABLE_HEADERS = [
  { key: "name", label: "Nombre", align: "text-left" },
  { key: "color", label: "Color", align: "text-left" },
  { key: "stock", label: "Stock", align: "text-left" },
  { key: "cost", label: "Costo (Bs.)", align: "text-left" },
  { key: "salePrice", label: "Precio Venta (Bs.)", align: "text-left" },
  { key: "image", label: "Imagen", align: "text-left" },
  { key: "actions", label: "Acciones", align: "text-center" },
];

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

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });

export default function InventoryPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuth();
  const confirm = useConfirm();
  const notify = useNotify();

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [formState, setFormState] = useState<ProductFormState>(INITIAL_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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
    if (!isHydrated || !user || user.role !== "admin" || hasLoadedProducts) return;
    (async () => {
      try {
        const rows = await listProducts();
        setProducts(rows);
      } catch (error) {
        console.warn("No se pudo cargar el inventario desde la nube:", error);
      } finally {
        setHasLoadedProducts(true);
      }
    })();
  }, [hasLoadedProducts, isHydrated, user]);

  // No persistence en local: cloud-only

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProduct(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

  useEffect(() => {
    if (!editingProduct) {
      return;
    }

    setFormState({
      name: editingProduct.name,
      color: editingProduct.color,
      stock: editingProduct.stock.toString(),
      cost: formatBs(editingProduct.cost).replace(/^Bs\.\s*/, ""),
      salePrice: formatBs(editingProduct.salePrice).replace(/^Bs\.\s*/, ""),
      imageFile: null,
      imagePreview: editingProduct.image?.dataUrl ?? null,
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
  }, [editingProduct]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) {
      return products;
    }

    const lowered = searchTerm.toLowerCase();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowered) ||
        product.color.toLowerCase().includes(lowered),
    );
  }, [products, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const resetForm = () => {
    setFormState(INITIAL_FORM_STATE);
    setFormError(null);
    setFeedback(null);
    setEditingProduct(null);
  };

  const handleInputChange = (
    field: keyof ProductFormState,
    value: string | File | null,
  ) => {
    setFormError(null);
    setFeedback(null);
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      handleInputChange("imageFile", null);
      handleInputChange("imagePreview", null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFormError("El archivo debe ser una imagen.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFormError("El archivo supera los 10 MB permitidos.");
      return;
    }

    try {
      const preview = await toBase64(file);
      handleInputChange("imageFile", file);
      handleInputChange("imagePreview", preview);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFeedback(null);

    if (!formState.name.trim() || !formState.color.trim()) {
      setFormError("Completa todos los campos obligatorios.");
      return;
    }

    const stockValue = Number.parseInt(formState.stock, 10);
    if (Number.isNaN(stockValue) || stockValue < 0) {
      setFormError("El stock debe ser un número entero mayor o igual a 0.");
      return;
    }

    const costValue = parseBsInput(formState.cost);
    const salePriceValue = parseBsInput(formState.salePrice);

    if (costValue === null || salePriceValue === null) {
      setFormError("Formato de monto inválido. Usa el formato 1.500,80.");
      return;
    }

    if (salePriceValue < costValue) {
      setFormError("El precio de venta debe ser mayor o igual al costo.");
      return;
    }

    let image: ProductImage | null = editingProduct?.image ?? null;
    if (formState.imageFile && formState.imagePreview) {
      image = {
        name: formState.imageFile.name,
        size: formState.imageFile.size,
        type: formState.imageFile.type,
        dataUrl: formState.imagePreview,
      };
    } else if (!formState.imagePreview) {
      image = null;
    }

    let feedbackMessage = "";

    if (editingProduct) {
      const updatedProduct: Product = {
        ...editingProduct,
        name: formState.name.trim(),
        color: formState.color.trim(),
        stock: stockValue,
        cost: costValue,
        salePrice: salePriceValue,
        image,
      };
      try {
        const saved = await upsertProductCloud(updatedProduct);
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      } catch (e) {
        setFormError("No se pudo actualizar el producto en la nube.");
        return;
      }
      feedbackMessage = `Producto "${updatedProduct.name}" actualizado.`;
      if (selectedProduct?.id === editingProduct.id) {
        setSelectedProduct((prev) => (prev && prev.id === updatedProduct.id ? updatedProduct : prev));
      }
    } else {
      const newProduct: Omit<Product, "id" | "createdAt"> = {
        name: formState.name.trim(),
        color: formState.color.trim(),
        stock: stockValue,
        cost: costValue,
        salePrice: salePriceValue,
        image,
      };
      try {
        const saved = await upsertProductCloud(newProduct);
        setProducts((prev) => [saved, ...prev]);
        feedbackMessage = `Producto "${saved.name}" agregado al inventario.`;
      } catch (e) {
        setFormError("No se pudo guardar el producto en la nube.");
        return;
      }
    }

    resetForm();
    if (feedbackMessage) {
      setFeedback(feedbackMessage);
    }
  };

  const handleClearInventory = async () => {
    if (products.length === 0) {
      return;
    }
    const confirmClear = await confirm({
      title: "Vaciar inventario",
      message: "¿Seguro que deseas vaciar el inventario? Esta acción eliminará todos los productos.",
      confirmText: "Vaciar",
      cancelText: "Cancelar",
      intent: "danger",
    });

    if (confirmClear) {
      try {
        // Eliminar en la nube uno por uno (simple; optimizable con SQL)
        for (const p of products) {
          // eslint-disable-next-line no-await-in-loop
          await deleteProductCloud(p.id);
        }
        setProducts([]);
        setSelectedProduct(null);
        setPage(1);
        resetForm();
        setFeedback("Inventario vaciado correctamente.");
        notify({ title: "Inventario vaciado", message: "Se eliminaron todos los productos.", variant: "success" });
      } catch {
        setFormError("No se pudo vaciar el inventario en la nube.");
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
            .map((column) => (column === "precioventa" ? "precioVenta" : column))
            .join(", ")}`,
        );
        return;
      }

  const importedProducts: Array<Omit<Product, "id" | "createdAt">> = [];
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

        const getCell = (key: string): { raw: unknown; text: string } => {
          const columnIndex = headerMap.get(key);
          if (columnIndex === undefined) {
            return { raw: "", text: "" };
          }

          const raw = rowValues[columnIndex];
          const text = normalizedValues[columnIndex] ?? "";
          return { raw, text };
        };

        const nameCell = getCell("nombre");
        const colorCell = getCell("color");
        const stockCell = getCell("stock");
        const costCell = getCell("costo");
        const salePriceCell = getCell("precioventa");

        const name = nameCell.text;
        const color = colorCell.text;
        const stockValue = Number.parseInt(stockCell.text, 10);
        const costValue = parseImportAmount(costCell.raw ?? costCell.text);
        const salePriceValue = parseImportAmount(salePriceCell.raw ?? salePriceCell.text);

        const lineNumber = rowIndex + 2;

        if (!name || !color) {
          issues.push(`Fila ${lineNumber}: faltan campos obligatorios.`);
          return;
        }

        if (Number.isNaN(stockValue) || stockValue < 0) {
          issues.push(`Fila ${lineNumber}: stock inválido.`);
          return;
        }

        if (costValue === null || salePriceValue === null) {
          issues.push(`Fila ${lineNumber}: formato de montos inválido.`);
          return;
        }

        if (salePriceValue < costValue) {
          issues.push(`Fila ${lineNumber}: el precio de venta no puede ser menor al costo.`);
          return;
        }

        importedProducts.push({
          name,
          color,
          stock: stockValue,
          cost: costValue,
          salePrice: salePriceValue,
          image: null,
        });
      });

      if (importedProducts.length > 0) {
        try {
          // Guardar en la nube en serie para simplicidad
          for (const p of importedProducts) {
            // eslint-disable-next-line no-await-in-loop
            const saved = await upsertProductCloud(p);
            setProducts((prev) => [saved, ...prev]);
          }
          setPage(1);
          setFeedback(
            `${importedProducts.length} producto${importedProducts.length === 1 ? "" : "s"} importado${
              importedProducts.length === 1 ? "" : "s"
            } correctamente.`,
          );
        } catch (e) {
          setFormError("Ocurrió un error al importar hacia la nube.");
        }
      }

      if (issues.length > 0) {
        const detail = issues.slice(0, 3).join(" ");
        const remaining =
          issues.length > 3 ? ` Se omitieron ${issues.length - 3} fila(s) adicionales.` : "";
        setFormError(`Algunas filas no se importaron. ${detail}${remaining}`);
      } else if (importedProducts.length === 0) {
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

    if (products.length === 0) {
      setFormError("No hay productos para exportar.");
      return;
    }

    const rows = [
      ["nombre", "color", "stock", "costo", "precioVenta", "fechaRegistro"],
      ...products.map((product) => [
        product.name,
        product.color,
        String(product.stock),
        product.cost.toFixed(2),
        product.salePrice.toFixed(2),
        new Date(product.createdAt).toLocaleString("es-BO", {
          dateStyle: "long",
          timeStyle: "medium",
          timeZone: "America/La_Paz",
        }),
      ]),
    ];

    const filename = `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadWorkbook(rows, filename);
    setFeedback("Inventario exportado en formato XLSX.");
  };

  const handleDownloadTemplate = () => {
    setFormError(null);
    setFeedback(null);

    const rows = [
      ["nombre", "color", "stock", "costo", "precioVenta"],
      ["Camisa Inteligente AIJ", "Azul", "25", "120,00", "210,00"],
    ];

    downloadWorkbook(rows, "formato-inventario.xlsx", "Plantilla");
    setFeedback("Plantilla descargada en formato XLSX.");
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(null);
    setFeedback(null);
    setFormError(null);
    setEditingProduct(product);
  };

  const handleViewProduct = (product: Product) => {
    setFormError(null);
    setFeedback(null);
    setSelectedProduct(product);
  };

  const handleDeleteProduct = async (productId: string) => {
    const target = products.find((product) => product.id === productId);
    if (!target) {
      return;
    }

    const confirmed = await confirm({
      title: "Eliminar producto",
      message: `¿Eliminar "${target.name}" del inventario?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      intent: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteProductCloud(productId);
      const nextProducts = products.filter((product) => product.id !== productId);
      setProducts(nextProducts);
      const nextTotalPages = Math.max(1, Math.ceil(nextProducts.length / pageSize));
      if (page > nextTotalPages) {
        setPage(nextTotalPages);
      }
    } catch {
      setFormError("No se pudo eliminar el producto en la nube.");
      return;
    }

    if (editingProduct?.id === productId) {
      resetForm();
    } else {
      setFormError(null);
    }

    // page adjustment handled above after deletion

    if (selectedProduct?.id === productId) {
      setSelectedProduct(null);
    }

    setFeedback(`Producto "${target.name}" eliminado.`);
    try {
      notify({ title: "Producto eliminado", message: `Se eliminó ${target.name}.`, variant: "success" });
    } catch {}
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
            Inventario AIJMIROSHOP
          </p>
          <h1 className="text-3xl font-semibold text-slate-100 sm:text-4xl">
            Registra y controla tus productos
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Administra el catálogo desde un solo lugar. Puedes agregar artículos, importar en masa
            y exportar plantillas en formato <span className="font-semibold text-slate-200">.xlsx</span>.
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
                {editingProduct ? "Editar producto" : "Agregar producto"}
              </h2>
              {editingProduct ? (
                <p className="text-xs text-slate-400">
                  Modificando: <span className="text-slate-200">{editingProduct.name}</span>
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
              <span className="text-sm font-medium text-slate-200">Nombre del producto *</span>
              <input
                ref={nameInputRef}
                required
                value={formState.name}
                onChange={(event) => handleInputChange("name", event.target.value)}
                placeholder="Ej. Camisa AIJ"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Color *</span>
              <input
                required
                value={formState.color}
                onChange={(event) => handleInputChange("color", event.target.value)}
                placeholder="Ej. Azul"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Stock *</span>
              <input
                required
                value={formState.stock}
                onChange={(event) => handleInputChange("stock", event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Ej. 45"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Costo (Bs.) *</span>
              <input
                required
                value={formState.cost}
                onChange={(event) => handleInputChange("cost", event.target.value)}
                placeholder="Ej. 150,00"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">Precio de venta (Bs.) *</span>
              <input
                required
                value={formState.salePrice}
                onChange={(event) => handleInputChange("salePrice", event.target.value)}
                placeholder="Ej. 250,00"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-200">Foto del producto (máx. 10 MB)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-100 hover:file:bg-slate-700"
              />
              {formState.imagePreview && formState.imageFile ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3 text-xs text-slate-300">
                  <Image
                    src={formState.imagePreview}
                    alt="Vista previa del producto"
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-lg object-cover"
                    unoptimized
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-slate-200">{formState.imageFile.name}</p>
                    <p>
                      {(() => {
                        const sizeMb = formState.imageFile.size / (1024 * 1024);
                        const displaySize = sizeMb < 0.01 ? "<0.01" : sizeMb.toFixed(2);
                        return `${displaySize} MB • ${formState.imageFile.type}`;
                      })()}
                    </p>
                  </div>
                </div>
              ) : null}
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
              {editingProduct ? "Actualizar producto" : "Guardar producto"}
            </button>
            <button
              type="button"
              onClick={handleClearInventory}
              className="inline-flex items-center justify-center rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20"
            >
              Vaciar inventario
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
            <h2 className="text-lg font-semibold text-slate-100">Inventario registrado</h2>
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
                placeholder="Nombre o color"
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
                {paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_HEADERS.length} className="px-4 py-10 text-center text-sm text-slate-400">
                      {products.length === 0
                        ? "No hay productos registrados. Agrega uno para comenzar."
                        : "Ningún producto coincide con la búsqueda."}
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product) => (
                    <tr key={product.id} className="border-b border-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-200">{product.name}</td>
                      <td className="px-4 py-3 text-slate-300">{product.color}</td>
                      <td className="px-4 py-3 text-slate-300">{product.stock}</td>
                      <td className="px-4 py-3 text-slate-300">{formatBs(product.cost)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatBs(product.salePrice)}</td>
                      <td className="px-4 py-3">
                        {product.image ? (
                          <Image
                            src={product.image.dataUrl}
                            alt={`Foto de ${product.name}`}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-lg object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-xs text-slate-500">Sin imagen</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProduct(product)}
                            className="inline-flex items-center justify-center rounded-lg border border-sky-500/60 bg-sky-500/10 p-2 text-sky-200 transition hover:bg-sky-500/20"
                            title="Editar"
                            aria-label={`Editar ${product.name}`}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewProduct(product)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/70 p-2 text-slate-200 transition hover:border-sky-500/70 hover:text-sky-200"
                            title="Ver detalles"
                            aria-label={`Ver detalles de ${product.name}`}
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id)}
                            className="inline-flex items-center justify-center rounded-lg border border-rose-500/60 bg-rose-500/10 p-2 text-rose-200 transition hover:bg-rose-500/20"
                            title="Eliminar"
                            aria-label={`Eliminar ${product.name}`}
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
            {paginatedProducts.length === 0 ? (
              <p className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
                {products.length === 0
                  ? "No hay productos registrados. Agrega uno para comenzar."
                  : "Ningún producto coincide con la búsqueda."}
              </p>
            ) : (
              paginatedProducts.map((product) => (
                <article key={product.id} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 shadow-inner shadow-slate-950/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/70">
                      {product.image ? (
                        <Image src={product.image.dataUrl} alt={`Foto de ${product.name}`} width={56} height={56} className="h-full w-full object-cover" unoptimized />
                      ) : (
                        <span className="text-[11px] text-slate-500">Sin imagen</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-slate-100">{product.name}</h3>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Color {product.color}</p>
                      <div className="mt-1 grid grid-cols-2 gap-2 text-sm text-slate-300">
                        <span>Stock: {product.stock}</span>
                        <span className="text-right">PU: {formatBs(product.salePrice)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditProduct(product)}
                      className="inline-flex items-center justify-center rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewProduct(product)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(product.id)}
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
              Mostrando {paginatedProducts.length} de {filteredProducts.length} productos
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

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedProduct(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-product-details"
            className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="inventory-product-details" className="text-xl font-semibold text-slate-100">
                  {selectedProduct.name}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">Detalle de producto</p>
                <p className="mt-2 text-sm text-slate-400">
                  Registrado el {new Date(selectedProduct.createdAt).toLocaleString("es-BO", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-sky-500/70 hover:text-sky-200"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {selectedProduct.image ? (
                <div className="flex flex-col items-center gap-3">
                  <Image
                    src={selectedProduct.image.dataUrl}
                    alt={`Imagen de ${selectedProduct.name}`}
                    width={160}
                    height={160}
                    className="h-40 w-40 rounded-2xl object-cover shadow-lg shadow-slate-950/40"
                    unoptimized
                  />
                  <p className="text-xs text-slate-400">
                    {selectedProduct.image.name} • {(() => {
                      const sizeMb = selectedProduct.image!.size / (1024 * 1024);
                      const displaySize = sizeMb < 0.01 ? "<0.01" : sizeMb.toFixed(2);
                      return `${displaySize} MB • ${selectedProduct.image!.type}`;
                    })()}
                  </p>
                </div>
              ) : (
                <p className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
                  No se adjuntó imagen para este producto.
                </p>
              )}

              <dl className="grid grid-cols-1 gap-4 text-sm text-slate-200 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Color</dt>
                  <dd className="mt-1 text-base text-slate-100">{selectedProduct.color}</dd>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Stock disponible</dt>
                  <dd className="mt-1 text-base text-slate-100">{selectedProduct.stock}</dd>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Costo (Bs.)</dt>
                  <dd className="mt-1 text-base text-slate-100">{formatBs(selectedProduct.cost)}</dd>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Precio de venta (Bs.)</dt>
                  <dd className="mt-1 text-base text-slate-100">{formatBs(selectedProduct.salePrice)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
