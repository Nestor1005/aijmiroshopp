# AIJMIROSHOP

Frontend moderno construido con Next.js 16 (App Router) y Tailwind CSS para el sistema web de AIJMIROSHOP. Incluye autenticación por roles, dashboard modular y base para integrar Supabase y desplegar en Vercel.

## Características principales

- Inicio de sesión con roles **Administrador** y **Operador**, validando credenciales en el cliente y conservando la sesión en `sessionStorage`.
- Dashboard responsivo con tarjetas por módulo (Inventario, Clientes, Orden de Venta, Registrar Venta, Historial, Reportes, Ajustes) y acceso restringido según el rol.
- Estilos oscuros modernos, navegación adaptable para smartphones y componentes preparados para crecer en funcionalidades.
- Placeholder de integración con Supabase y archivo `.env.example` listo para configurar.

### Configuraciones

- Umbral de "stock bajo" configurable: en el módulo Reportes (solo administradores) puedes ajustar el valor a partir del cual un producto se considera de stock bajo. Se guarda en el navegador (localStorage) con la clave `miroshop:low-stock-threshold` y por defecto es 5.

- Ajustes (solo Administrador):
	- Usuarios: cambiar usuario/contraseña del admin y gestionar múltiples operadores (activar/desactivar, editar, eliminar). Se almacenan en `miroshop:users`.
	- Tickets: personalizar nombre de empresa, subtítulo, mensaje de despedida y los correlativos de Orden de Venta y Venta. Se almacenan en `miroshop:tickets-config`. Las páginas de Orden de Venta y Registrar Venta usan estos valores y actualizan automáticamente el siguiente número.

## Primer uso y credenciales por defecto

- Credenciales iniciales cargadas por defecto:
	- Administrador: Usuario "Anahi" / Contraseña "12345"
	- Operador: Usuario "Operador" / Contraseña "12345"

Recomendado: cambia estas credenciales desde el módulo Ajustes > Usuarios.

Nota: Si eliminas la configuración de usuarios del navegador (localStorage clave `miroshop:users`), en el siguiente inicio la pantalla solicitará crear el Administrador por primera vez.

## Scripts disponibles

```bash
npm run dev     # Ejecuta el servidor en modo desarrollo
npm run lint    # Ejecuta ESLint
npm run build   # Construye la app para producción
npm run start   # Sirve la versión construida
```

## Variables de entorno

Copiar `.env.example` a `.env.local` y completar los valores:

```bash
NEXT_PUBLIC_SUPABASE_URL=tu-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-api-key
```

Mientras no existan estas variables, el helper `getSupabaseClient()` lanzará un error controlado recordando configurar la integración.

## Estructura relevante

- `app/page.tsx`: pantalla de acceso con selección de rol.
- `app/dashboard/page.tsx`: dashboard principal con tarjetas y navegación responsiva.
- `lib/auth-context.tsx`: contexto de autenticación y manejo de sesión.
- `lib/supabase-client.ts`: helper para inicializar Supabase (placeholder).

## Despliegue en Vercel

1. Configurar las variables de entorno en el proyecto de Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. Hacer `npm run build` para validar localmente.
3. Conectar el repositorio a Vercel y desplegar.

Luego se puede enlazar Supabase para persistir datos reales de inventario, ventas y reportes.
