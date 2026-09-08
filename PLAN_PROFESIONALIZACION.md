# Mundo Pets: plan de profesionalización

> **Fecha:** 7 de septiembre de 2026
> **Continúa a:** `ANALISIS_ARQUITECTURA.md` (Fase 0 seguridad, Fase Infraestructura, Fase Procesamiento y Fase Visualización y diseño, ya completadas).
> **Alcance:** este documento no describe código existente, sino el plan objetivo de las próximas fases. Ninguna fase implica reescribir el frontend, cambiar de framework backend ni tocar el árbol de páginas HTML/diseño visual actual.

## 1. Resumen de fases

| Fase | Nombre | Objetivo principal | Duración estimada |
|---|---|---|---|
| 1 | Calidad y Datos | TypeScript incremental + Prisma + Zod | 2-3 semanas |
| 2 | Verificación automática | Testing (Vitest/Playwright) + CI | 1 semana |
| 3 | Ciclo comercial real | Pagos reales, disponibilidad, carrito persistente | 2-3 semanas |
| 4 | Experiencia | Alpine.js sobre el HTML actual | 3-5 días |
| 5 | Producción robusta | HTTPS activo + Redis (si aplica) | 2-3 días |

El orden importa: las fases 3 y 4 dependen de tener una capa de datos y validación confiable (fase 1) y una red de tests que detecte roturas (fase 2). Las duraciones son estimaciones de referencia, no compromisos — ajústalas a tu disponibilidad real.

---

## 2. Fase 1 — Calidad y Datos (TypeScript + Prisma + Zod)

> **Estado (7-sep-2026):** en curso. Completado: validación Zod + códigos HTTP normalizados (400/401/403/404/409), tooling TypeScript (`typecheck`), Prisma 7 con FK real `products.category_id`, y migración de las lecturas públicas (`/api/categories`, `/api/products`) a Prisma. Pendiente: migrar admin/orders a Prisma, migraciones formales y conversión de `server.js` a TS. Ver sección 20 de `ANALISIS_ARQUITECTURA.md`.

### Objetivo
Tipar el backend y reemplazar las queries SQL manuales por un ORM con migraciones, cerrando la deuda técnica de la relación `products.categoria` ↔ `categories` sin FK.

### Tareas

**2.1 TypeScript incremental**
1. Instalar `typescript`, `@types/node`, `@types/express`, `ts-node` (dev) en `backend/`.
2. Crear `tsconfig.json` con `allowJs: true` y `checkJs: false`, para que JS y TS convivan durante la migración.
3. Migrar primero archivos pequeños y aislados (middlewares, config de `.env`, utilidades) antes que `server.js` completo.
4. Añadir `tsc --noEmit` como paso de validación adicional a los `node --check` existentes.

**2.2 Prisma como ORM**
1. Instalar `prisma` y `@prisma/client`.
2. `prisma init` apuntando a la misma base MySQL; usar `prisma db pull` para introspectar el esquema actual (`setup-db.sql`) en vez de recrear tablas desde cero.
3. Definir la relación real `products.categoryId → categories.id` como FK; decidir si se conserva `categoria` (texto) como columna legado durante la transición o se migra de una vez con un script de datos.
4. Generar una migración "baseline" que documente el estado actual sin alterar datos existentes.
5. Reemplazar las queries de `mysql2` ruta por ruta, empezando por las de menor riesgo: `categories` → `products` → `orders`/`reservations` al final (son las más sensibles porque ya están en producción funcional).

**2.3 Validación con Zod**
1. Definir esquemas de validación por endpoint: `login`, `register`, `products` (admin), `categories` (admin), `orders`.
2. Crear un middleware genérico que valide `body`/`query` contra el esquema y un manejador de errores central.
3. Normalizar códigos HTTP en todo el API: `400` validación, `401` no autenticado, `403` sin permiso, `404` no encontrado, `409` conflicto (por ejemplo, categoría con productos asociados al intentar borrarla).

### Archivos principalmente afectados
`backend/server.js` (o su equivalente `.ts`), `backend/setup-db.sql` (pasa a convivir con el schema de Prisma), nuevo `backend/prisma/schema.prisma`, nuevos archivos de esquemas Zod.

### Cómo validar el cierre de la fase
- `tsc --noEmit` sin errores.
- Todas las rutas responden con los códigos HTTP normalizados (probar con Postman/curl los casos de error de cada endpoint).
- `prisma migrate status` sin migraciones pendientes; los datos de `seed.js` siguen cargando igual.
- Eliminar o crear una categoría sigue bloqueando/permitiendo según corresponda, ahora vía FK real en vez de lógica manual.

### Riesgos
- Introspección de Prisma sobre una base con relación por texto puede requerir ajustes manuales al `schema.prisma` generado — revisar antes de aplicar migraciones.
- Migrar `orders`/`reservations` al final reduce el riesgo de romper el flujo de checkout que ya está en uso.

---

## 3. Fase 2 — Verificación automática (Testing + CI)

### Objetivo
Tener una red de pruebas que detecte roturas antes de tocar pagos y disponibilidad (fase 3), ya que hoy no existe suite automatizada.

### Tareas
1. Instalar `vitest` (o `jest`) + `supertest` en `backend/`.
2. Escribir tests para: login/registro (casos válidos e inválidos), protección de rutas admin por rol, CRUD de productos/categorías, checkout completo (creación de `orders`/`order_items`/`reservations`), reglas de fecha del calendario (domingos, festivos, fechas pasadas).
3. Añadir 1-2 flujos end-to-end con **Playwright**: login → agregar al carrito → checkout.
4. Crear un workflow de **GitHub Actions** que en cada push/PR ejecute: `tsc --noEmit`, la suite de tests, y `npm run build:css` en `frontend/`.

### Cómo validar el cierre de la fase
- El workflow de CI pasa en verde en un push de prueba.
- Los tests cubren al menos los casos de la sección 12 de `ANALISIS_ARQUITECTURA.md` (autenticación, roles, checkout).

---

## 4. Fase 3 — Ciclo comercial real (Pagos + Disponibilidad + Carrito)

### Objetivo
Cerrar los puntos de "prioridad alta" pendientes del análisis: pagos reales y validación de disponibilidad antes de confirmar una compra.

### Tareas

**4.1 Pagos reales**
1. Comparar **Wompi** vs **ePayco** (comisión, tiempo de integración, soporte de PSE/Nequi/tarjeta, calidad de sandbox) y elegir uno.
2. Crear tabla `payments` (`orderId`, proveedor, referencia externa, estado, monto, fecha).
3. Endpoint que crea la intención de pago y redirige (o embebe) el checkout del proveedor.
4. Webhook que recibe la confirmación y actualiza `orders.estado` y `payments.estado` automáticamente.

**4.2 Disponibilidad real**
1. Definir cupos/horarios por servicio y fecha para `peluqueria` y `guarderia` (tabla de franjas o reglas simples de cupo máximo por día).
2. Bloquear en backend la creación de una reserva si la franja ya está llena o en conflicto, en vez de solo validar la fecha en el frontend como hoy.

**4.3 Carrito persistente**
- Opción simple: guardar el carrito en `localStorage` igual que ya se hace con los tokens, para que sobreviva a un refresh.
- Opción robusta: tabla `carts` en MySQL asociada al usuario, para que el carrito persista entre dispositivos.

### Cómo validar el cierre de la fase
- Un pago de prueba en sandbox del proveedor elegido actualiza el estado del pedido sin intervención manual.
- Intentar reservar dos citas en la misma franja para el mismo servicio es rechazado por el backend.
- Recargar la página con productos en el carrito no lo vacía.

---

## 5. Fase 4 — Experiencia (Alpine.js sobre el HTML actual)

### Objetivo
Reducir la complejidad de estado en `script.js`/`admin.js` sin introducir un bundler ni reescribir el frontend.

### Tareas
1. Agregar Alpine.js vía CDN (una línea en el `<head>`), igual que ya se hace con SweetAlert2 y Font Awesome.
2. Migrar el estado del carrito de variables globales a `x-data`, conservando las clases Tailwind y el HTML existente.
3. Convertir los modales (producto, carrito, checkout) a `x-show`/`x-transition` para reutilizar las transiciones ya definidas en `input.css`.

### Cómo validar el cierre de la fase
- El resultado visual es idéntico al actual (sin cambios de diseño).
- No se agrega ningún paso de build nuevo al frontend.

---

## 6. Fase 5 — Producción robusta (HTTPS + Redis)

### Objetivo
Cerrar el punto pendiente de HTTPS y preparar la caché para escalar horizontalmente si hace falta.

### Tareas
1. Activar en un servidor real la configuración de Nginx + Let's Encrypt que ya existe en `deploy/`.
2. Si en algún momento se corre PM2 en modo cluster (varias instancias), mover la caché en memoria de catálogo/categorías y el carrito (si se persiste en servidor) a **Redis**, para que se comparta entre procesos.

### Cómo validar el cierre de la fase
- El sitio responde por HTTPS y redirige HTTP → HTTPS.
- Con más de una instancia de PM2, la caché de catálogo se invalida igual para todas.

---

## 7. Notas de continuidad

- Mantener el mismo formato de "Fase" y de verificación que `ANALISIS_ARQUITECTURA.md`, para que este plan quede documentado con la misma convención que el resto del proyecto.
- Actualizar `ANALISIS_ARQUITECTURA.md` al cerrar cada fase, igual que se hizo con las fases anteriores.
- Ninguna fase de este plan requiere tocar `frontend/index.html`, `login.html` o `register.html`, ni cambiar el framework backend.
