# Instrucciones para agentes

## Panorama del proyecto

Mundo Pets es una aplicación web servida por un único proceso Node.js:

- `backend/server.js` es el entrypoint. Express sirve `frontend/`, `img/` y la API REST bajo `/api`.
- El backend usa CommonJS, MySQL mediante `mysql2/promise`, JWT, bcrypt, Helmet, CORS, rate limiting, Multer y Sharp.
- El frontend está compuesto por páginas HTML independientes y JavaScript vanilla; no usa React, TypeScript, Vue, Angular ni bundler.
- Tailwind CSS se compila desde `frontend/src/input.css` hacia `frontend/dist/tailwind.css`.
- La arquitectura detallada y el inventario funcional están en [ANALISIS_ARQUITECTURA.md](ANALISIS_ARQUITECTURA.md).

## Comandos de desarrollo

Ejecutar desde la raíz en PowerShell:

```powershell
npm --prefix backend install
npm --prefix frontend install
npm --prefix frontend run build:css
node backend/seed.js
node backend/server.js
```

El servidor usa `PORT` o `5000` por defecto y requiere MySQL accesible, normalmente en `localhost:3306`. La configuración local se toma de `backend/.env`; para producción se usa `NODE_ENV=production` y `backend/.env.production`. Nunca introduzcas secretos reales en el repositorio.

Durante cambios de estilos, usa `npm --prefix frontend run watch:css` o vuelve a ejecutar `build:css`. Modifica `frontend/src/input.css`, no `frontend/dist/tailwind.css` manualmente.

## Validación

No hay suite automatizada ni scripts `test` declarados. Como mínimo, después de cambios de JavaScript ejecuta:

```powershell
node --check backend/server.js
node --check frontend/script.js
node --check frontend/admin.js
```

Para validar cambios de CSS, ejecuta `npm --prefix frontend run build:css`. Si el cambio toca persistencia o autenticación, valida también con MySQL configurado y revisa los flujos afectados; el fallback de `backend/users.json` solo cubre registro e inicio de sesión, no catálogo, pedidos ni administración.

## Límites de responsabilidad

- Backend: autorización, validación de entrada, precios definitivos, persistencia, pedidos, reservas, CRUD administrativo y procesamiento de imágenes.
- Frontend: presentación, validaciones de experiencia, estado del carrito, `localStorage` y llamadas `fetch`.
- Nunca confíes en precios, roles o permisos enviados por el navegador; el backend debe recalcular y verificar.
- Las rutas administrativas deben conservar la protección mediante `requireAdmin`.
- Las contraseñas deben mantenerse con bcrypt y los secretos JWT deben venir del entorno.
- Las reservas actuales se persisten como pendientes, pero no implementan cupos, horarios ni detección de conflictos.
- Los pagos son simulados: aceptar un método no significa que exista integración con PSE o Mercado Pago.

## Convenciones de cambio

- Respeta el estilo existente y evita reformatos masivos o refactorizaciones no relacionadas.
- Para cambios de esquema o datos, revisa y mantén coherentes `backend/setup-db.sql` y `backend/seed.js`.
- Para cambios de interfaz, actualiza las páginas o scripts correspondientes y recompila Tailwind. Los assets pueden llevar un parámetro `?v=...`; actualízalo cuando sea necesario para evitar caché del navegador.
- Mantén la compatibilidad con el frontend servido por Express y con el modo de apertura directa mediante archivo, que usa `http://localhost:5000` como API.
- Si agregas una dependencia, actualiza el `package.json` y el lockfile del subproyecto correcto (`backend/` o `frontend/`); no mezcles dependencias entre ambos.
- Usa `deploy/DEPLOY.md`, `deploy/nginx-mundo-pets.conf`, `ecosystem.config.js` y `scripts/backup-db.ps1` como referencias para despliegue y operación, sin asumir que sus valores de ejemplo son configuración lista para producción.

## Archivos de referencia

- [backend/server.js](backend/server.js): rutas, middleware y lógica principal de la API.
- [backend/setup-db.sql](backend/setup-db.sql): esquema declarativo de MySQL.
- [backend/seed.js](backend/seed.js): creación/migración básica y datos iniciales.
- [frontend/script.js](frontend/script.js): autenticación cliente, catálogo, carrito y dashboard.
- [frontend/admin.js](frontend/admin.js): operaciones del panel administrativo.
- [deploy/DEPLOY.md](deploy/DEPLOY.md): procedimiento de despliegue.

El `README.md` actual no contiene documentación operativa útil; no lo uses como fuente de comandos o arquitectura hasta que se actualice.
