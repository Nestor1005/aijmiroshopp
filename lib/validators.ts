export const isValidPhone = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const digits = trimmed.replace(/[\s+-]/g, "");
  return digits.length >= 7 && digits.length <= 15;
};
