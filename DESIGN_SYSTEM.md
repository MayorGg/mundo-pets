# Mundo Pets — Design System

Guía interna de la interfaz. **Regla de oro:** toda pantalla nueva debe usar estos tokens y componentes; no se inventan colores, sombras, radios ni duraciones sueltas.

El código fuente de los estilos es [`frontend/src/input.css`](frontend/src/input.css); se compila a `frontend/dist/tailwind.css` con `npm --prefix frontend run build`.

---

## 1. Fundamentos (tokens)

Definidos en el bloque `@theme` de `input.css`. Se consumen como utilidades de Tailwind (`text-brand`, `bg-brand-soft`, `rounded-card`, `shadow-card`, …).

### Color

| Token | Utilidad | Hex | Uso |
|---|---|---|---|
| `--color-brand` | `brand` | `#0e7c7b` | Color principal (textos, bordes, iconos) |
| `--color-brand-dark` | `brand-dark` | `#0a5354` | Énfasis, precios, fin de gradiente |
| `--color-brand-soft` | `brand-soft` | `#e8f5f4` | Fondos suaves, chips, thead |
| `--color-ink` | `ink` | `#143438` | Texto principal |
| `--color-muted` | `muted` | `#4a6468` | Texto secundario |
| `--color-success` | `success` | `#1a8a62` | Estados positivos |
| `--color-warn` / `--color-warn-dark` | `warn` | `#c9a227` / `#b07d1a` | Destacados / advertencia |
| `--color-info` | `info` | `#2a8f9a` | Información |
| `--color-danger` | `danger` | `#b42318` | Error / eliminar |
| `--color-line` / `--color-line-strong` | — (CSS) | teal 14% / 30% | Bordes de tablas y tarjetas |

Gradientes (clases): `.bg-gradient-primary` (`#0e7c7b → #0a5354`), `.bg-gradient-success`, `.bg-gradient-warning`, `.bg-gradient-info`.

### Tipografía

- **Display / títulos:** `Playfair Display` → utilidad `font-display` (aplicada a `h1, h2, h3`).
- **Texto / UI:** `Outfit` → `font-sans` (por defecto en `body`).

### Forma y profundidad

- Radio de tarjetas: `--radius-card` = `1.25rem` → `rounded-card`.
- Sombras: `shadow-card` (`0 18px 50px …`), `shadow-card-hover`. Botones: `--shadow-btn`.

### Movimiento

- Duración estándar: **220 ms**; curva `cubic-bezier(0.22, 1, 0.36, 1)`.
- Todas las utilidades `transition` de Tailwind heredan esta curva (`--default-transition-duration` / `--default-transition-timing-function`). **No agregues `duration-*` sueltos.**
- Se respeta `prefers-reduced-motion`; en táctil (`hover: none`) se desactivan los `translate`.

---

## 2. Componentes

### Botones

| Clase | Descripción |
|---|---|
| `.btn-brand` | Primario: gradiente teal, texto blanco; hover oscurece (mantiene gradiente) y eleva; `:active` escala 0.97 |
| `.btn-brand-success` | Acción de compra (gradiente verde→teal) |
| `.btn-brand-outline` | Secundario: borde teal, se rellena al hover |
| `.btn-social` | Redes (TikTok/Instagram/WhatsApp): borde oscuro, se rellena a `ink` |
| `.payment-btn` (+ `.payment-selected`) | Métodos de pago; el seleccionado usa el gradiente primario |

Tamaño: se controla con utilidades (`px-6 py-3 text-base`). Todos los botones comparten radio pill y la curva de 220 ms.

### Formularios

- `.input-field` — borde `brand` al 18%, radio `0.85rem`, fondo blanco 85%; al foco: borde teal + anillo. `.input-field.input-error` para estado inválido.

### Badges / pills

- `.badge` + variantes: `.badge-success`, `.badge-danger`, `.badge-info`, `.badge-warn`, `.badge-muted`, `.badge-brand` (gradiente). Fondo tintado del propio color.

### Tablas (admin)

- `.data-table-wrap` (contenedor con borde y radio) + `.data-table` (encabezados uppercase pequeños, separadores `--color-line`, hover de fila `brand-soft`).

### Tarjetas y superficies

- `.glass-card` — superficie translúcida (blur 18px, borde blanco, sombra + highlight superior). Base de la mayoría de paneles.
- `.catalog-card` — tarjeta de categoría (glass + hover lift + `fadeInUp`), con `.icon-wrapper` para el círculo del icono.
- `.product-card` — tarjeta de producto (columna, botón anclado abajo).
- `.stat-item` / `.stat-number` / `.stat-label` — estadísticas.
- `.benefit-item`, `.checkout-summary`, `.service-calendar`.

### Modales

- Contenedor `fixed inset-0 … flex` con `.modal-backdrop` (fondo oscuro + blur) y `.modal-panel` (radio, sombra, animación `modalIn`). Encabezado con `.modal-header-bar` (+ gradiente) y cierre `.modal-close`.
- Cierre con `Escape`; el foco entra al panel y vuelve al elemento previo.

### Calendario de agenda

- `.service-calendar` y celdas `.cal-cell` (`.cal-available`, `.cal-selected`, `.cal-today`, `.cal-holiday`, `.cal-disabled`, `.cal-sunday`, `.cal-past`), leyenda `.cal-swatch-*`.

### Carga y vacíos

- `.skeleton` / `.skeleton-line` / `.skeleton-line-lg` — shimmer para carga.
- `.empty-state` / `.empty-state-icon` — estados vacíos.

### Texto de apoyo

- `.section-kicker` — etiqueta uppercase pequeña sobre títulos de sección.
- `.page-kicker` — bloque de texto blanco sobre el fondo (con sombra).
- `.lead`, `.brand-title`, `.brand-subtitle`, `.hero-mark`.

---

## 3. Flujo de trabajo

```powershell
# Editar estilos
frontend/src/input.css            →  npm --prefix frontend run watch:css

# Editar páginas HTML (¡NO editar frontend/*.html, son generados!)
frontend/src/pages/*.html         →  npm --prefix frontend run build:pages

# Build completo (CSS + páginas + cache-busting por hash)
npm --prefix frontend run build
```

- `frontend/partials/` contiene los fragmentos compartidos (`head.html`, `contact.html`).
- `frontend/build-pages.mjs` compone las páginas y estampa `?v=<hash>` por asset.
- Los `frontend/*.html` y `frontend/dist/tailwind.css` son **generados** (se versionan, pero no se editan a mano).
