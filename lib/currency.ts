const numberFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatBs = (value: number) => `Bs. ${numberFormatter.format(value)}`;

export const parseBsInput = (input: string): number | null => {
  if (!input) {
    return null;
  }

  const normalized = input
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");

  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    return null;
  }

  return value;
};
