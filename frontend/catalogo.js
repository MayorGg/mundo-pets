// Catálogo público (sin login). Consume la API pública y lista los productos.
const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin;

const BANDAS = {
  alimentos: { clase: 'bg-warn', icono: 'fa-bone' },
  medicamentos: { clase: 'bg-danger', icono: 'fa-pills' },
  peluqueria: { clase: 'bg-info', icono: 'fa-cut' },
  guarderia: { clase: 'bg-success', icono: 'fa-home' }
};

let todos = [];
let filtro = '';

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function tarjeta(p) {
  const banda = BANDAS[normalizar(p.categoria)] || { clase: 'bg-brand', icono: 'fa-box' };
  const img = p.imagen
    ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" class="absolute inset-0 h-full w-full object-cover" onerror="this.remove()">`
    : '';
  return `
    <article class="product-card h-full">
      <div class="relative flex h-28 items-center justify-center ${banda.clase}">
        <i class="fas ${banda.icono} fa-3x text-white/85"></i>
        <span class="absolute top-2 right-3 text-xs font-semibold text-white/90">${esc(p.categoria)}</span>
        ${img}
      </div>
      <div class="flex flex-1 flex-col p-4 text-center">
        <h3 class="mb-1 text-lg font-bold text-brand">${esc(p.nombre)}</h3>
        <p class="mb-2 text-sm text-muted">${esc(p.descripcion)}</p>
        <p class="product-price mb-3"><span class="text-xl font-bold text-success">$${Number(p.precio).toLocaleString()}</span></p>
        <a href="login.html" class="btn-brand-success mt-auto w-full py-2.5 no-underline">
          <i class="fas fa-sign-in-alt mr-2"></i>Comprar
        </a>
      </div>
    </article>`;
}

function pintar() {
  const grid = document.getElementById('catalogoGrid');
  const lista = filtro ? todos.filter(p => normalizar(p.categoria) === filtro) : todos;
  grid.innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<div class="col-span-full glass-card rounded-card p-8 text-center text-muted">No hay productos en esta categoría.</div>';
}

function pintarFiltros() {
  const cont = document.getElementById('catalogoFiltros');
  const categorias = [...new Set(todos.map(p => p.categoria))];
  const opciones = [{ clave: '', etiqueta: 'Todas' }, ...categorias.map(c => ({ clave: normalizar(c), etiqueta: c }))];
  cont.innerHTML = opciones.map(o => {
    const activo = filtro === o.clave;
    return `<button type="button" class="${activo ? 'btn-brand' : 'btn-brand-outline'} px-4 py-2 text-sm" data-filtro="${esc(o.clave)}">${esc(o.etiqueta)}</button>`;
  }).join('');
  cont.querySelectorAll('button[data-filtro]').forEach(btn => {
    btn.addEventListener('click', () => { filtro = btn.dataset.filtro; pintarFiltros(); pintar(); });
  });
}

function inyectarJsonLd(productos) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Catálogo Mundo Pets',
    itemListElement: productos.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.nombre,
        description: p.descripcion || undefined,
        image: p.imagen || undefined,
        category: p.categoria,
        offers: {
          '@type': 'Offer',
          price: Number(p.precio),
          priceCurrency: 'COP',
          availability: 'https://schema.org/InStock'
        }
      }
    }))
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(ld);
  document.head.appendChild(script);
}

async function iniciar() {
  const grid = document.getElementById('catalogoGrid');
  grid.innerHTML = Array.from({ length: 8 }, () => `
    <div class="product-card h-full p-4" aria-hidden="true">
      <div class="skeleton mb-3 h-28 w-full"></div>
      <div class="skeleton skeleton-line mb-2 w-3/4 mx-auto"></div>
      <div class="skeleton skeleton-line w-1/2 mx-auto"></div>
    </div>`).join('');

  try {
    const res = await fetch(`${API_BASE_URL}/api/products?limit=200`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    todos = Array.isArray(data) ? data : (data.items || []);
    pintarFiltros();
    pintar();
    if (todos.length) inyectarJsonLd(todos);
  } catch (err) {
    console.error('No se pudo cargar el catálogo:', err.message);
    grid.innerHTML = '<div class="col-span-full glass-card rounded-card p-8 text-center text-muted">No se pudo cargar el catálogo en este momento.</div>';
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
