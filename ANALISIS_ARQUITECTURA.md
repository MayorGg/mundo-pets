# Mundo Pets: análisis de arquitectura y funcionamiento

> **Fecha del análisis:** 2 de septiembre de 2026  
> **Última actualización:** 2 de septiembre de 2026 — Fase 0 de seguridad (bcrypt, JWT + refresh, CORS, rate limiting) y Fase Infraestructura (helmet, compression, cache-control, PM2, backups, Nginx/Let's Encrypt).  
> **Alcance:** revisión estática del repositorio actual. Este documento describe lo que está implementado en el código, no una arquitectura objetivo.

## 1. Resumen ejecutivo

Mundo Pets es una aplicación web para mostrar productos y servicios para mascotas, permitir el registro e inicio de sesión de usuarios y ofrecer un panel de administración para gestionar el catálogo y los usuarios.

La solución está dividida en dos capas principales:

- **Backend:** servidor Node.js con Express. Sirve los archivos estáticos del frontend, expone una API REST y accede a MySQL mediante un pool de conexiones.
- **Frontend:** páginas HTML independientes con JavaScript vanilla. Tailwind CSS se compila desde una hoja fuente y la interacción se realiza con DOM, `fetch`, `localStorage` y modales.

El sistema tiene catálogo, autenticación, roles, administración de productos/categorías/usuarios, carrito y selección de fechas para determinados servicios. Sin embargo, el carrito, las reservas y el checkout no se persisten en el servidor. El pago es una simulación visual y no existe una entidad de pedido ni integración con una pasarela real.

### Estado funcional resumido

| Área | Estado actual |
|---|---|
| Catálogo público desde MySQL | Implementado para productos activos y categorías |
| Registro e inicio de sesión | Implementado con JWT |
| Roles `user` y `admin` | Implementados en backend y frontend |
| Gestión administrativa | Implementada para productos, categorías y usuarios |
| Carrito | Implementado solo en memoria del navegador |
| Reserva de servicios | Selección de fecha implementada solo en memoria |
| Pedidos | No existe API ni tabla |
| Pagos | Simulados; no hay proveedor conectado |
| Fallback sin MySQL | Solo cubre registro e inicio de sesión mediante `users.json` |

## 2. Estructura del repositorio

```text
mundo pets/
├── README.md
├── LICENSE
├── ANALISIS_ARQUITECTURA.md
├── ecosystem.config.js   (PM2)
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── setup-db.sql
│   ├── seed.js
│   ├── seed-temp-user.js
│   ├── migrate-passwords.js
│   ├── users.json
│   ├── .env.example
│   ├── .env.production    (plantilla; no versionado en uso real)
│   └── .env              (no versionado)
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── admin.html
│   ├── favicon.svg
│   ├── script.js
│   ├── admin.js
│   ├── src/input.css
│   └── dist/tailwind.css
├── scripts/
│   └── backup-db.ps1
├── deploy/
│   ├── nginx-mundo-pets.conf
│   └── DEPLOY.md
├── backups/              (no versionado)
├── logs/                 (no versionado)
└── img/
```

### Responsabilidad de cada zona

| Ruta | Responsabilidad |
|---|---|
| [backend/server.js](backend/server.js) | Punto de entrada del servidor, rutas HTTP, conexión a MySQL, JWT, middleware y archivos estáticos |
| [backend/setup-db.sql](backend/setup-db.sql) | Creación declarativa de la base de datos y sus tablas |
| [backend/seed.js](backend/seed.js) | Creación/migración básica de tablas y carga idempotente del catálogo y usuarios demo |
| [backend/seed-temp-user.js](backend/seed-temp-user.js) | Alta de un usuario temporal en MySQL |
| [backend/migrate-passwords.js](backend/migrate-passwords.js) | Migra contraseñas en texto plano a hash bcrypt (MySQL y `users.json`) |
| [backend/users.json](backend/users.json) | Base de usuarios usada únicamente cuando MySQL falla en login/registro; contraseñas hasheadas |
| [backend/.env](backend/.env) | Configuración local (BD, JWT, CORS, PORT); no versionado |
| [backend/.env.example](backend/.env.example) | Plantilla documentada de variables de entorno |
| [backend/.env.production](backend/.env.production) | Plantilla de producción; no versionado en uso real |
| [frontend/favicon.svg](frontend/favicon.svg) | Favicon de la marca (SVG) |
| [frontend/index.html](frontend/index.html) | Página de bienvenida y enlaces a autenticación |
| [frontend/login.html](frontend/login.html) | Formulario de inicio de sesión |
| [frontend/register.html](frontend/register.html) | Formulario de registro |
| [frontend/dashboard.html](frontend/dashboard.html) | Catálogo del usuario, carrito y checkout |
| [frontend/admin.html](frontend/admin.html) | Interfaz del panel administrativo |
| [frontend/script.js](frontend/script.js) | Estado y comportamiento del dashboard, autenticación cliente, catálogo, calendario y carrito |
| [frontend/admin.js](frontend/admin.js) | Consumo de API administrativa, tablas, formularios y modales CRUD |
| [frontend/src/input.css](frontend/src/input.css) | Fuente CSS de Tailwind y estilos propios |
| [ecosystem.config.js](ecosystem.config.js) | Configuración del supervisor de procesos PM2 |
| [scripts/backup-db.ps1](scripts/backup-db.ps1) | Backup automático de MySQL (mysqldump + retención) |
| [deploy/nginx-mundo-pets.conf](deploy/nginx-mundo-pets.conf) | Reverse proxy Nginx con TLS/Let's Encrypt (plantilla) |
| [deploy/DEPLOY.md](deploy/DEPLOY.md) | Guía de despliegue en producción |
| [img/](img/) | Recursos gráficos servidos por Express |

`frontend/dist/tailwind.css` se genera con el script `build:css` y está versionado en el repositorio. `backups/`, `logs/` y los `.env` reales no se versionan.

## 3. Arquitectura de ejecución

```mermaid
flowchart LR
    subgraph Producción (desplegado)
        Internet[Internet] -->|HTTPS 443| Nginx[Nginx reverse proxy]
        Nginx -->|HTTP 5000| PM2[PM2 supervisor]
        PM2 --> Express[backend/server.js]
    end
    subgraph Desarrollo local
        BrowserLocal[navegador] -->|HTTP :5000| ExpressLocal[backend/server.js]
    end
    Express -->|sirve HTML, JS y CSS| Browser
    Express -->|/api/*| API[API REST]
    API --> Auth[JWT, roles, helmet, rate limiting]
    API --> Pool[Pool mysql2/promise]
    Pool --> DB[(MySQL mundo_pets)]
    Auth -.si MySQL no responde.-> JSON[users.json]
    Browser --> Local[estado local: localStorage y memoria]
    CDN[CDN externos] --> Browser
```

En desarrollo el navegador llega directo al puerto `5000`. En producción, Nginx termina TLS y hace proxy a `127.0.0.1:5000`, y PM2 mantiene vivo el proceso (reinicio automático y logs centralizados en `logs/`).

### Flujo de una petición

1. El navegador solicita una página al puerto `5000`.
2. Express sirve el contenido de `frontend/` mediante `express.static`.
3. El JavaScript de la página ejecuta llamadas `fetch` contra `http://localhost:5000/api`.
4. Las rutas públicas consultan el pool MySQL.
5. Las rutas administrativas pasan por `requireAdmin`, que valida un JWT y el rol `admin`.
6. El resultado se devuelve como JSON y el frontend actualiza el DOM.

El servidor expone también `/img` como alias para la carpeta raíz `img/`.

## 4. Stack tecnológico

### Backend

- Node.js como runtime, sin versión fijada en los manifiestos.
- Express `^4.18.2` para servidor HTTP y API REST.
- `mysql2` `^3.18.0` para consultas MySQL con promesas.
- `jsonwebtoken` `^9.0.2` para emitir y validar tokens (con expiración y refresh).
- `bcryptjs` `^3.0.3` para hash y verificación de contraseñas.
- `express-rate-limit` `^8.7.0` para limitar intentos en login y registro.
- `helmet` `^8.3.0` para cabeceras HTTP de seguridad (CSP configurada para el frontend vanilla).
- `compression` `^1.8.1` para compresión gzip de respuestas.
- `cors` `^2.8.5` para permitir peticiones cross-origin de orígenes restringidos.
- `dotenv` `^17.4.2` para cargar configuración desde `.env` / `.env.production` según `NODE_ENV`.
- CommonJS (`require` y `module` implícito), no TypeScript.

Otros componentes de infraestructura (no son dependencias npm):

- **PM2** como supervisor de procesos (config en `ecosystem.config.js`).
- **Nginx** como reverse proxy y terminador TLS (plantilla en `deploy/nginx-mundo-pets.conf`).
- **Let's Encrypt / certbot** para certificados HTTPS (guía en `deploy/DEPLOY.md`).

### Frontend

- HTML5 y JavaScript vanilla, sin React, Vue, Angular ni bundler.
- Tailwind CSS `^4.0.0` y `@tailwindcss/cli` `^4.0.0` como dependencias de desarrollo.
- Font Awesome 6.4.0 desde CDN para iconos.
- SweetAlert2 11 desde CDN para alertas, confirmaciones y mensajes.
- Google Fonts: Outfit y Playfair Display.

Los manifiestos están en [backend/package.json](backend/package.json) y [frontend/package.json](frontend/package.json). El backend no declara scripts npm; se inicia con `node server.js` o bajo PM2 (`ecosystem.config.js`).

## 5. Instalación y ejecución local

### Requisitos

- Node.js y npm.
- MySQL disponible en `localhost:3306`, salvo que se configure otro host/puerto.
- Una base de datos que pueda crear o modificar `mundo_pets`.
- Navegador con JavaScript habilitado.

### Backend

```bash
cd backend
npm install
node seed.js
node server.js
```

El servidor escucha en `http://localhost:5000`.

En desarrollo/despliegue se puede iniciar bajo el supervisor PM2 (reinicio automático y logs en `logs/`):

```bash
pm2 start ecosystem.config.js      # desarrollo
pm2 start ecosystem.config.js --env production
pm2 status / pm2 logs mundo-pets
```

Como alternativa, se puede ejecutar el esquema SQL de [backend/setup-db.sql](backend/setup-db.sql) directamente y después iniciar el servidor.

### Frontend y CSS

```bash
cd frontend
npm install
npm run build:css
```

Durante el desarrollo se puede usar:

```bash
npm run watch:css
```

El comando compila `src/input.css` en `dist/tailwind.css`. Las páginas esperan ese archivo en `dist/tailwind.css`.

### Variables de entorno

El backend carga variables según el ambiente (`NODE_ENV`):

- `development` (o sin definir) → `backend/.env`.
- `production` → `backend/.env.production`.

Las plantillas están en [backend/.env.example](backend/.env.example) y [backend/.env.production](backend/.env.production). Variables usadas:

| Variable | Valor predeterminado | Uso |
|---|---|---|
| `NODE_ENV` | `development` | Ambiente; selecciona el archivo de entorno |
| `PORT` | `5000` | Puerto HTTP en el que escucha Express |
| `DB_HOST` | `localhost` | Servidor MySQL |
| `DB_PORT` | `3306` | Puerto MySQL |
| `DB_USER` | `root` | Usuario MySQL |
| `DB_PASSWORD` | vacío | Contraseña MySQL |
| `DB_NAME` | `mundo_pets` | Base de datos |
| `JWT_SECRET` | — (genera uno temporal aleatorio con aviso) | Secreto para firmar los tokens JWT |
| `JWT_EXPIRES_IN` | `2h` | Vida del access token |
| `REFRESH_EXPIRES_IN` | `7d` | Vida del refresh token |
| `CORS_ORIGIN` | `http://localhost:5000` | Orígenes permitidos por CORS, separados por coma |

El puerto HTTP ya no es fijo: Express escucha en `process.env.PORT || 5000`.

## 6. Páginas y navegación

### `index.html`

Es la entrada pública. Presenta la marca, enlaces a iniciar sesión y crear cuenta, y enlaces externos a TikTok, Instagram y WhatsApp. No carga datos del catálogo.

### `login.html`

Recoge `identifier` y `password`. El identificador puede ser nombre de usuario o correo electrónico. `script.js` valida que ambos campos existan, llama a `POST /api/login`, guarda el token de acceso, el refresh token, el usuario y el rol en `localStorage`, y redirige:

- Rol `admin`: `admin.html`.
- Cualquier otro rol: `dashboard.html`.

### `register.html`

Recoge nombre de usuario, correo y contraseña. El frontend exige una contraseña mínima de seis caracteres y valida el formato del correo. Llama a `POST /api/register` y, después de mostrar éxito, redirige a `login.html`.

Aunque el backend devuelve un token tras registrar, el frontend no lo guarda ni inicia sesión automáticamente.

### `dashboard.html`

Es el área del usuario autenticado. Al cargarse:

1. Comprueba que exista `authToken`.
2. Actualiza el contador del carrito.
3. Solicita productos activos mediante `GET /api/products`.
4. Agrupa los productos por una clave derivada de la categoría.
5. Muestra las cuatro categorías principales.

La página contiene modales para productos, carrito y checkout. El carrito no se almacena en `localStorage`, por lo que desaparece al recargar o abandonar la página.

### `admin.html`

Comprueba que existan token y rol `admin` en `localStorage`. Si falta alguno, redirige al login. Tiene secciones de resumen, productos, categorías y usuarios. `admin.js` carga las cuatro fuentes de información y permite operaciones CRUD mediante la API protegida.

## 7. Funcionalidad del catálogo y servicios

### Carga del catálogo

`cargarProductos()` en [frontend/script.js](frontend/script.js) llama a `GET /api/products`. Si la petición falla, utiliza `PRODUCTOS_LOCALES`, un catálogo embebido con 16 productos agrupados en cuatro categorías.

El fallback del frontend permite renderizar productos sin API, pero no sustituye la persistencia administrativa ni el acceso a categorías de MySQL.

### Categorías iniciales

1. Alimentos.
2. Medicamentos.
3. Peluquería.
4. Guardería.

Las categorías se diferencian visualmente por color e icono. La clave interna se normaliza quitando tildes y espacios: por ejemplo, `Peluquería` se convierte en `peluqueria`.

### Servicios con fecha

`peluqueria` y `guarderia` se consideran categorías con agenda. Al abrirlas, el usuario debe elegir una fecha antes de agregar un servicio al carrito.

El calendario en `script.js` está fijado al año 2026 y utiliza la zona horaria `America/Bogota`. Rechaza:

- domingos;
- festivos incluidos en `FESTIVOS_CO_2026`;
- fechas anteriores a la fecha actual de Bogotá.

No hay disponibilidad guardada en servidor, control de cupos, bloqueo de horarios ni comprobación de conflictos entre usuarios.

## 8. Carrito y checkout

El estado principal vive en variables globales de `script.js`:

```javascript
let carrito = [];
let metodoPagoSeleccionado = null;
let fechaServicioSeleccionada = null;
```

Cada línea del carrito tiene la forma conceptual:

```text
{ id, nombre, precio, cantidad, fecha }
```

Los servicios se agrupan por `id` y fecha; los productos sin fecha se agrupan por `id`. El usuario puede incrementar, disminuir o eliminar líneas.

El checkout:

1. Comprueba que el carrito no esté vacío.
2. Construye un resumen en el modal.
3. Permite elegir PSE, Mercado Pago o efectivo.
4. Muestra mensajes de procesamiento y éxito.
5. Vacía el carrito y vuelve a `dashboard.html`.

No se envía información de compra al backend. No existe una tabla `orders`, `order_items`, `payments` o equivalente. Las menciones a PSE y Mercado Pago son únicamente interfaz; el código indica que sería necesario conectar esos proveedores.

## 9. API REST

La URL base es `http://localhost:5000/api`. Las respuestas normalmente son JSON. Las rutas administrativas requieren `Authorization: Bearer <token>`.

### Catálogo público

| Método y ruta | Autenticación | Comportamiento |
|---|---|---|
| `GET /api/categories` | No | Devuelve `id`, `nombre`, `descripcion`, `icono` y `color`, ordenados por nombre |
| `GET /api/products` | No | Devuelve productos con `activo = 1`, ordenados por categoría e ID; convierte precio a número y `requiere_fecha` a booleano |

Si MySQL falla, estas rutas responden error 500. No usan `users.json` ni el catálogo local del frontend.

### Autenticación

| Método y ruta | Entrada | Resultado |
|---|---|---|
| `POST /api/register` | `username`, `email`, `password` | Crea usuario con rol `user` y contraseña hasheada con bcrypt; devuelve access token, refresh token, usuario, rol y mensaje |
| `POST /api/login` | `identifier`, `password` | Busca por username o email, verifica la contraseña (bcrypt) y devuelve access token, refresh token, usuario, rol y mensaje |
| `POST /api/auth/refresh` | `refreshToken` | Valida el refresh token y devuelve un access token nuevo (`{ token, role }`) |

El registro comprueba campos requeridos, formato básico de email y duplicados. El login devuelve error de credenciales inválidas cuando no encuentra coincidencia o la contraseña no es correcta. Las validaciones de campos faltantes responden JSON de error, pero no establecen siempre un código HTTP 400.

**Rate limiting:** `POST /api/register` y `POST /api/login` están limitados a **20 peticiones cada 15 minutos** por IP (`express-rate-limit`); al superarlo responden `429`. El endpoint `/api/auth/refresh` no tiene límite.

### Administración

| Método y ruta | Entrada/efecto |
|---|---|
| `GET /api/admin/stats` | Conteo de usuarios, productos y categorías |
| `GET /api/admin/categories` | Categorías con fecha de creación y cantidad de productos asociados |
| `POST /api/admin/categories` | Crea categoría; exige nombre y color de `warn`, `danger`, `info`, `success`, `brand` o `muted` |
| `PUT /api/admin/categories/:id` | Actualiza categoría; si cambia el nombre, actualiza `products.categoria` |
| `DELETE /api/admin/categories/:id` | Elimina solo si no tiene productos asociados |
| `GET /api/admin/users` | Lista ID, username, email, rol y fecha de creación |
| `DELETE /api/admin/users/:id` | Elimina usuarios; bloquea eliminar una cuenta admin |
| `PUT /api/admin/users/:id/role` | Cambia el rol a `user` o `admin`; protege el último administrador y el propio rol |
| `GET /api/admin/products` | Lista todos los productos, incluidos inactivos |
| `POST /api/admin/products` | Crea producto y verifica que exista la categoría |
| `PUT /api/admin/products/:id` | Actualiza producto y valida categoría |
| `DELETE /api/admin/products/:id` | Elimina producto físicamente |

Los productos aceptan `nombre`, `categoria`, `precio`, `descripcion`, `imagen`, `requiere_fecha` y `activo`. El backend exige nombre, categoría y precio numérico no negativo. No hay paginación, filtros ni endpoint para órdenes.

## 10. Modelo de datos y persistencia

La base se llama `mundo_pets`, usa `utf8mb4` y está declarada en [backend/setup-db.sql](backend/setup-db.sql).

### `users`

| Campo | Tipo | Significado |
|---|---|---|
| `id` | `INT AUTO_INCREMENT` | Identificador primario |
| `username` | `VARCHAR(50) UNIQUE` | Nombre de usuario |
| `email` | `VARCHAR(100) UNIQUE` | Correo |
| `password` | `VARCHAR(255)` | Hash bcrypt (cost 10); ya no se almacena texto plano |
| `role` | `ENUM('user','admin')` | Rol de autorización |
| `created_at` | `TIMESTAMP` | Fecha de creación |

### `products`

| Campo | Tipo | Significado |
|---|---|---|
| `id` | `INT AUTO_INCREMENT` | Identificador primario |
| `nombre` | `VARCHAR(100)` | Nombre comercial |
| `categoria` | `VARCHAR(50)` | Nombre de categoría |
| `precio` | `DECIMAL(10,2)` | Precio |
| `descripcion` | `TEXT NULL` | Descripción |
| `imagen` | `VARCHAR(255) NULL` | Ruta o URL, aunque el catálogo actual no la usa para renderizar la tarjeta |
| `requiere_fecha` | `TINYINT(1)` | Indica servicio con agenda |
| `activo` | `TINYINT(1)` | Visibilidad en el catálogo público |

### `categories`

| Campo | Tipo | Significado |
|---|---|---|
| `id` | `INT AUTO_INCREMENT` | Identificador primario |
| `nombre` | `VARCHAR(50) UNIQUE` | Nombre visible y clave referenciada por texto |
| `descripcion` | `TEXT NULL` | Descripción |
| `icono` | `VARCHAR(50)` | Clase de Font Awesome |
| `color` | `VARCHAR(20)` | Clave de color visual |
| `created_at` | `TIMESTAMP` | Fecha de creación |

No existe una clave foránea entre `products.categoria` y `categories`. La relación se realiza por igualdad de texto. Por eso el backend implementa manualmente la cascada cuando se renombra una categoría y bloquea su eliminación si encuentra productos asociados.

### Datos iniciales

[backend/seed.js](backend/seed.js) crea o actualiza:

- cuatro categorías;
- 16 productos, cuatro por categoría;
- usuario administrador `admin`;
- usuario demo `demo`.

El seed usa `ON DUPLICATE KEY UPDATE` para categorías y productos. También agrega columnas `role` y `created_at` a `users` si no existen. Las credenciales demo/admin se insertan con hash bcrypt. Sus credenciales están escritas en el código y deben tratarse como credenciales de desarrollo.

### Fallback `users.json`

Cuando una conexión MySQL falla durante login o registro, `server.js` lee o escribe [backend/users.json](backend/users.json). Ese fallback:

- guarda usuarios en un archivo local;
- no contiene el mismo esquema completo de MySQL (sin `role` ni `created_at`);
- no proporciona productos ni categorías;
- puede producir divergencia entre los usuarios de JSON y los de MySQL;
- firma tokens con el mismo secreto y expiración del servidor;
- almacena las contraseñas con hash bcrypt (igual que MySQL); si una contraseña legacy llegara en texto plano, se migra a hash en el primer login.

## 11. Autenticación

Esta sección cubre la autenticación y la autorización por roles.

### Backend

`requireAuth`:

1. Lee `Authorization`.
2. Exige el prefijo `Bearer `.
3. Valida el token con `jwt.verify`.
4. Coloca el payload en `req.user`.
5. Responde 401 si falta o es inválido.

`requireAdmin` ejecuta `requireAuth` y exige `req.user.role === 'admin'`; en caso contrario responde 403.

`requireAuth` además **rechaza los refresh tokens** (payload con `tokenType: 'refresh'`), que solo pueden usarse en `POST /api/auth/refresh`.

El payload del access token contiene:

```text
{ id, username, role }
```

- **Access token:** expira en `JWT_EXPIRES_IN` (por defecto `2h`).
- **Refresh token:** expira en `REFRESH_EXPIRES_IN` (por defecto `7d`) e incluye `tokenType: 'refresh'`.
- El secreto se lee de `process.env.JWT_SECRET`; si no existe, se genera uno temporal aleatorio con un aviso en consola (los tokens dejan de servir al reiniciar). Ya no hay un secreto fijo en el código.

### Frontend

El cliente guarda:

- `authToken` (access token);
- `refreshToken`;
- `username`;
- `role`.

`dashboard.html` solo verifica presencia del token. `admin.html` verifica además el rol guardado. En `admin.js`, si una petición a la API responde `401`, se intenta renovar el access token con el refresh token (`POST /api/auth/refresh`) y se reintenta la petición una vez; si la renovación falla, se cierra la sesión. La protección efectiva de la API está en el backend, porque los valores de `localStorage` pueden modificarse desde el navegador.

## 12. Seguridad y deuda técnica observada

Estos hallazgos describen el estado actual. Los puntos 1, 2, 3, 5 y 6 se resolvieron en la última iteración de seguridad; el resto permanece pendiente:

1. ~~**Contraseñas en texto plano**~~ **Resuelto:** se almacenan y comparan con hash bcrypt (cost 10) en MySQL y `users.json`; `backend/migrate-passwords.js` migra datos legacy y el login auto-migra contraseñas viejas.
2. ~~**Secreto JWT fijo y expuesto**~~ **Resuelto:** el secreto se lee de `JWT_SECRET` en `.env` (sin fallback fijo en el código).
3. ~~**CORS abierto**~~ **Resuelto:** `CORS_ORIGIN` restringe orígenes; los no permitidos reciben `403`.
4. **HTTPS no activo aún:** las credenciales y tokens necesitan transporte seguro fuera del entorno local. La config de Nginx + Let's Encrypt ya está preparada en `deploy/` (ver sección 17), pero falta activarla en un servidor real.
5. ~~**Sin rate limiting**~~ **Resuelto:** login y registro limitados a 20 intentos / 15 min (`429`).
6. ~~**Tokens sin expiración explícita**~~ **Resuelto:** access token 2h + refresh token 7d con `POST /api/auth/refresh`; `requireAuth` rechaza refresh tokens.
7. **Fallback inconsistente:** si falla MySQL, solo autenticación cambia a JSON; el catálogo continúa fallando.
8. **Carrito no persistente:** una recarga elimina la compra preparada.
9. **Reserva no persistente:** seleccionar una fecha no bloquea disponibilidad ni crea una reserva.
10. **Pago simulado:** no se valida, cobra ni confirma ninguna transacción real.
11. **Ausencia de pedidos:** no existe historial, factura, estado de pedido o trazabilidad.
12. **Relación por texto:** cambiar manualmente nombres de categorías puede dejar datos inconsistentes si se hace fuera del endpoint previsto.
13. **Códigos HTTP irregulares:** algunos errores de validación o recursos inexistentes se devuelven con HTTP 200 y un campo `error`.
14. **Año del calendario fijo:** la lógica de disponibilidad deja de ser adecuada al cambiar el año.
15. **Contenido HTML dinámico:** parte del catálogo se interpola en `innerHTML`; el panel admin sí tiene un helper `esc`, pero la superficie debe revisarse de forma integral.

Nuevos hallazgos de la iteración de seguridad:

- El refresh token se guarda en `localStorage` del navegador; si bien permite renovar la sesión, un XSS podría robarlo. La mitigación a futuro es un refresh token en `httpOnly` cookie.
- `/api/auth/refresh` no tiene rate limiting (el robo de un refresh token permitiría emitir access tokens ilimitadamente hasta su expiración).
- Al no existir `JWT_SECRET` se genera uno temporal aleatorio por arranque; en ese escenario los tokens emitidos dejan de ser válidos al reiniciar el servidor.

## 13. Integraciones y recursos externos

El frontend depende de recursos externos cargados desde CDN:

- Google Fonts para tipografía.
- Font Awesome para iconos.
- SweetAlert2 para mensajes y modales de confirmación.

La página pública incluye enlaces a:

- TikTok de Mundo Pets.
- Instagram de Mundo Pets.
- WhatsApp con mensaje prellenado.

No se observan integraciones de backend con correo, almacenamiento de imágenes, proveedor de pagos, calendario externo, inventario o logística.

## 14. Guía para mantenimiento

### Para modificar el catálogo

1. Cambiar el modelo o datos iniciales en `seed.js` y/o ejecutar una operación desde el panel admin.
2. Mantener sincronizados los nombres de `categories.nombre` y `products.categoria`.
3. Verificar `activo` para controlar la visibilidad pública.
4. Verificar `requiere_fecha` si el producto debe solicitar fecha.

### Para modificar la API

1. Añadir la ruta en `backend/server.js`.
2. Aplicar `requireAuth` o `requireAdmin` según corresponda.
3. Usar consultas parametrizadas, como en las rutas existentes.
4. Definir de forma consistente el código HTTP y el cuerpo JSON de éxito y error.
5. Actualizar el consumidor correspondiente en `script.js` o `admin.js`.

### Para modificar la interfaz

- Las páginas HTML definen la estructura y cargan sus scripts.
- `script.js` es compartido por las páginas públicas y el dashboard.
- `admin.js` pertenece al panel administrativo.
- Los estilos fuente están en `frontend/src/input.css`; tras modificarlos hay que ejecutar `npm run build:css`.
- Las variables de estado global del dashboard no sobreviven a una recarga.

## 15. Recomendaciones priorizadas

### Prioridad alta

1. ~~Hashear contraseñas y retirar las credenciales de desarrollo del código y de archivos versionados~~ **Hecho** (bcrypt + migración + `.env` gitignoreado).
2. ~~Mover el secreto JWT a una variable de entorno fuerte, definir expiración y diseñar renovación~~ **Hecho** (`JWT_SECRET` en `.env`, access 2h, refresh 7d, `POST /api/auth/refresh`).
3. Restringir CORS y servir la aplicación mediante HTTPS. **CORS hecho** (`CORS_ORIGIN`); **HTTPS en preparación** (config Nginx + Let's Encrypt en `deploy/`, pendiente de activar).
4. Crear entidades y endpoints para pedidos, líneas de pedido, pagos y reservas.
5. Validar disponibilidad y precios en backend antes de confirmar una compra.

### Prioridad media

1. Sustituir la relación textual de productos por una clave foránea a categorías.
2. Unificar códigos HTTP y formato de errores.
3. ~~Añadir rate limiting~~ **Hecho** en login/registro; pendiente auditoría administrativa y validación de entrada más estricta.
4. Externalizar la URL de la API y el año/calendario de servicios. **Nota:** `API_BASE_URL = 'http://localhost:5000'` está hardcodeado en `script.js`/`admin.js` y hoy convive con la CSP y `CORS_ORIGIN` de desarrollo; en producción debe resolverse por el mismo origen o ajustar CSP/CORS (ver sección 17).
5. Añadir pruebas automatizadas para autenticación, autorización, CRUD y reglas de fechas.

### Prioridad de evolución funcional

1. Persistir el carrito o asociarlo a una sesión/usuario.
2. Crear historial de compras y reservas.
3. Integrar un proveedor de pagos real mediante backend.
4. Añadir disponibilidad por horario, cupos y conflictos.
5. Gestionar imágenes con validación y almacenamiento controlado.

## 16. Conclusión

Mundo Pets es actualmente un prototipo funcional de comercio y servicios para mascotas con una base técnica sencilla: Express, MySQL, páginas estáticas y JavaScript vanilla. Su punto fuerte es la separación clara entre servidor, interfaz y datos, además de contar con administración de catálogo y roles.

Su principal límite arquitectónico es que el recorrido comercial termina en el navegador: no hay persistencia de carrito, reservas, pedidos ni pagos. Por tanto, debe considerarse una aplicación de catálogo con checkout simulado, no todavía una plataforma transaccional completa.

En la última iteración se endureció la base de seguridad: contraseñas hasheadas con bcrypt, secreto JWT externo con expiración y refresh token, CORS restringido y rate limiting en autenticación. El siguiente paso recomendado es llevar la confirmación de compras y reservas al backend (pedidos, pagos y disponibilidad), completar HTTPS y normalizar los códigos HTTP.

## 17. Infraestructura y producción (Fase Infraestructura)

Cambios orientados a que el proyecto pueda salir de `localhost`. La seguridad (Fase 0) se documenta en las secciones 9, 11 y 12; aquí se cubre lo de despliegue y transporte.

### Cabeceras y compresión (`backend/server.js`)

- **helmet** agrega cabeceras de seguridad: CSP, `X-Content-Type-Options`, `X-Frame-Options`, etc. La CSP se configuró para no romper el frontend vanilla: `script-src` y `script-src-attr` incluyen `'unsafe-inline'` (los `onclick` inline), se permiten los CDN de SweetAlert2/Font Awesome/Google Fonts, y `upgrade-insecure-requests` está desactivado para no romper el desarrollo por HTTP.
- **compression** aplica gzip a las respuestas (`Content-Encoding: gzip`).

### Cache-Control en estáticos

| Tipo de recurso | Cabecera |
|---|---|
| HTML (`.html`) | `no-cache` |
| CSS, JS, SVG, imágenes, fuentes (versionados con `?v=`) | `public, max-age=31536000, immutable` |
| Resto | `public, max-age=3600` |

Los assets se versionan con parámetro `?v=` en las cinco páginas (`dist/tailwind.css?v=1`, `script.js?v=1`, `admin.js?v=1`). **Al modificar un asset hay que subir la versión** para invalidar la caché del navegador.

### Entorno por ambiente

`server.js` carga `backend/.env` en desarrollo o `backend/.env.production` en producción según `NODE_ENV`. El puerto es configurable con `PORT` (por defecto 5000). Plantillas en `.env.example` y `.env.production`; los `.env` reales no se versionan (`.gitignore`).

### Supervisor de procesos: PM2

- Config en [ecosystem.config.js](ecosystem.config.js): app `mundo-pets`, `autorestart: true`, `max_restarts: 10`, reinicio con retardo, límite de memoria 512 MB, logs en `logs/pm2-*.log`.
- `pm2 start ecosystem.config.js` (o `--env production`). PM2 reinicia la app si el proceso cae; `pm2 startup` lo deja arrancando con el sistema.
- Verificado localmente: al matar el proceso node, PM2 lo levanta de nuevo.

### Backups de MySQL

- [scripts/backup-db.ps1](scripts/backup-db.ps1) lee credenciales de `backend/.env`, ejecuta `mysqldump` (con `--single-transaction --routines`) hacia `backups/`, conserva los últimos 14 dumps y evita exponer la contraseña (usa `MYSQL_PWD` y la limpia al terminar).
- En Windows se registró la tarea programada `MundoPetsBackup` (diaria 03:00); en Linux la guía usa `crontab`. Los dumps no se versionan.

### Reverse proxy y HTTPS

- [deploy/nginx-mundo-pets.conf](deploy/nginx-mundo-pets.conf): Nginx termina TLS (Let's Encrypt), redirige HTTP→HTTPS, comprime respuestas y hace proxy a `127.0.0.1:5000` con `X-Forwarded-*`.
- [deploy/DEPLOY.md](deploy/DEPLOY.md): pasos de despliegue (DNS, MySQL, PM2, nginx, certbot, firewall, backups).
- El HTTPS aún **no está activo** en un servidor real; la configuración y la guía están preparadas.

### Otros

- **favicon:** `frontend/favicon.svg` (huella dorada sobre teal) enlazado en las 5 páginas; `GET /favicon.ico` redirige al SVG para evitar el 404.

### Pendiente identificado

- `script.js` y `admin.js` tienen `API_BASE_URL = 'http://localhost:5000'` hardcodeado. En producción con HTTPS y la CSP/CORS actuales, la API debería servirse por el mismo origen (sin hardcode) o ajustarse la CSP y `CORS_ORIGIN`. Está pendiente de externalizar la URL de la API.
