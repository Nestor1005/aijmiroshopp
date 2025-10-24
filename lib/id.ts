// Cross-browser safe UUID generator
// Prefer crypto.randomUUID when available; fallback to RFC4122 v4 via getRandomValues;
// last resort: timestamp + random suffix.
export function uid(): string {
  try {
    // Modern browsers
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {}

  try {
    // RFC4122 v4 based on getRandomValues
    const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
    if (getRandomValues) {
      const bytes = new Uint8Array(16);
      getRandomValues(bytes);
      // Set version (4) and variant (RFC4122)
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const toHex = (b: number) => b.toString(16).padStart(2, "0");
      const hex = Array.from(bytes, toHex).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {}

  // Minimal collision-safe fallback
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2);
  return `${t}-${r}`;
}
