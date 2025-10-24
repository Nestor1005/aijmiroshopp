import type { NextConfig } from "next";

// Nota: usamos una aserción de tipo para permitir claves que aún pueden no estar en los tipos de Next
// (por ejemplo, allowedDevOrigins). Next.js las reconoce en runtime.
const devOrigins = [
  // Hostnames sin protocolo/puerto (formatos aceptados por Next)
  "10.71.206.9",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  // Orígenes completos por si el entorno requiere coincidencia estricta
  "http://10.71.206.9:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://0.0.0.0:3000",
];

const nextConfig = ({
  // Otras opciones...
  // Permitir acceder al dev server desde la IP de red local sin bloquear recursos /_next/*
  // Más info: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: process.env.NODE_ENV === "development" ? devOrigins : undefined,
} as unknown) as NextConfig;

export default nextConfig;
