// En producción la API se sirve desde el mismo origen; el fallback permite abrir el frontend localmente.
const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Base de datos de productos (fallback local si la API no está disponible)
const PRODUCTOS_LOCALES = {
  alimentos: [
    { id: 1, nombre: "Croquetas Premium", precio: 45000, descripcion: "Alimento balanceado para perros adultos", imagen: "alimento.jpg", categoria: "Alimentos" },
    { id: 2, nombre: "Comida Húmeda Gatos", precio: 15000, descripcion: "Pate de salmón para gatos", imagen: "alimento.jpg", categoria: "Alimentos" },
    { id: 3, nombre: "Snacks Caninos", precio: 8000, descripcion: "Galletas de entrenamiento", imagen: "alimento.jpg", categoria: "Alimentos" },
    { id: 4, nombre: "Vitaminas Mascotas", precio: 25000, descripcion: "Suplemento vitamínico completo", imagen: "alimento.jpg", categoria: "Alimentos" }
  ],
  medicamentos: [
    { id: 5, nombre: "Antiparasitario", precio: 35000, descripcion: "Desparasitante interno y externo", imagen: "medicamento.jpg", categoria: "Medicamentos" },
    { id: 6, nombre: "Antiinflamatorio", precio: 28000, descripcion: "Para dolores articulares", imagen: "medicamento.jpg", categoria: "Medicamentos" },
    { id: 7, nombre: "Antibiótico", precio: 42000, descripcion: "Tratamiento infecciones", imagen: "medicamento.jpg", categoria: "Medicamentos" },
    { id: 8, nombre: "Vacuna Triple", precio: 55000, descripcion: "Vacuna polivalente", imagen: "medicamento.jpg", categoria: "Medicamentos" }
  ],
  peluqueria: [
    { id: 9, nombre: "Baño y Corte", precio: 35000, descripcion: "Servicio completo de peluquería", imagen: "peluqueria.jpg", categoria: "Peluquería" },
    { id: 10, nombre: "Corte de Uñas", precio: 15000, descripcion: "Corte y limpieza de uñas", imagen: "peluqueria.jpg", categoria: "Peluquería" },
    { id: 11, nombre: "Limpieza de Oídos", precio: 12000, descripcion: "Limpieza profunda de oídos", imagen: "peluqueria.jpg", categoria: "Peluquería" },
    { id: 12, nombre: "Tratamiento Capilar", precio: 45000, descripcion: "Hidratación y brillo", imagen: "peluqueria.jpg", categoria: "Peluquería" }
  ],
  guarderia: [
    { id: 13, nombre: "Guardería Día", precio: 25000, descripcion: "Cuidado por día completo", imagen: "guarderia.jpg", categoria: "Guardería" },
    { id: 14, nombre: "Guardería Noche", precio: 35000, descripcion: "Cuidado nocturno", imagen: "guarderia.jpg", categoria: "Guardería" },
    { id: 15, nombre: "Paseo Grupal", precio: 15000, descripcion: "Paseo de 1 hora en grupo", imagen: "guarderia.jpg", categoria: "Guardería" },
    { id: 16, nombre: "Entrenamiento", precio: 50000, descripcion: "Sesión de entrenamiento básico", imagen: "guarderia.jpg", categoria: "Guardería" }
  ]
};

let PRODUCTOS = {};

// Calendario laboral Colombia 2026 (festivos oficiales, incl. Ley Emiliani)
const FESTIVOS_CO_2026 = {
  '2026-01-01': 'Año Nuevo',
  '2026-01-12': 'Reyes Magos',
  '2026-03-23': 'Día de San José',
  '2026-04-02': 'Jueves Santo',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-05-18': 'Ascensión del Señor',
  '2026-06-08': 'Corpus Christi',
  '2026-06-15': 'Sagrado Corazón',
  '2026-06-29': 'San Pedro y San Pablo',
  '2026-07-20': 'Independencia de Colombia',
  '2026-08-07': 'Batalla de Boyacá',
  '2026-08-17': 'Asunción de la Virgen',
  '2026-10-12': 'Día de la Raza',
  '2026-11-02': 'Todos los Santos',
  '2026-11-16': 'Independencia de Cartagena',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad'
};

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CATEGORIAS_CON_AGENDA = ['peluqueria', 'guarderia'];

let carrito = (() => {
  try {
    const guardado = JSON.parse(localStorage.getItem('mundoPetsCart') || '[]');
    return Array.isArray(guardado) ? guardado : [];
  } catch {
    return [];
  }
})();
let metodoPagoSeleccionado = null;
let fechaServicioSeleccionada = null;
let calendarioMes = 7;
let categoriaServicioActual = null;

// Gestión de modales sin Bootstrap (Alpine maneja la visibilidad vía x-show; hay fallback directo)
const MODALS = ['productsModal', 'cartModal', 'checkoutModal'];
const MODAL_STORE_KEY = {
  productsModal: 'productsOpen',
  cartModal: 'cartOpen',
  checkoutModal: 'checkoutOpen'
};
let lastFocused = null;

// Acceso perezoso al store de UI: lo crea si aún no existe (no depende del orden de alpine:init)
function uiStore() {
  if (!window.Alpine) return null;
  if (!Alpine.store('ui')) {
    Alpine.store('ui', {
      productsOpen: false,
      cartOpen: false,
      checkoutOpen: false,
      cartCount: 0
    });
  }
  return Alpine.store('ui');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const ui = uiStore();
  if (ui) ui[MODAL_STORE_KEY[id]] = true;
  // Garantizar visibilidad directa (coherente con x-show; funciona también sin Alpine)
  el.removeAttribute('x-cloak');
  el.style.display = 'flex';
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  lastFocused = document.activeElement;
  const focusable = el.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const ui = uiStore();
  if (ui) ui[MODAL_STORE_KEY[id]] = false;
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

function renderProductSkeletons(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="product-card p-4" aria-hidden="true">
      <div class="skeleton mb-4 h-28 w-full"></div>
      <div class="skeleton skeleton-line-lg mb-3 w-3/4"></div>
      <div class="skeleton skeleton-line mb-2 w-full"></div>
      <div class="skeleton skeleton-line mb-4 w-2/3"></div>
      <div class="skeleton h-10 w-full"></div>
    </div>
  `).join('');
}

function renderEmptyState(icon, title, message) {
  return `
    <div class="empty-state col-span-full">
      <div class="empty-state-icon" aria-hidden="true"><i class="fas ${icon} fa-2x"></i></div>
      <strong class="text-brand">${title}</strong>
      <span class="text-sm">${message}</span>
    </div>
  `;
}

// Cerrar modales con Escape
document.addEventListener('keydown', (e) => {
  const open = MODALS.map(id => document.getElementById(id))
    .find(el => el && getComputedStyle(el).display !== 'none');
  if (!open) return;
  if (e.key === 'Escape') {
    closeModal(open.id);
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = [...open.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (focusable.length < 2) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// Limpiar errores de campo al escribir
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => setFieldError(input.id, ''));
  });
});

function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  const esClave = input.type === 'password';
  input.type = esClave ? 'text' : 'password';
  if (icon) icon.className = esClave ? 'fas fa-eye-slash' : 'fas fa-eye';
  const btn = icon && icon.closest('button');
  if (btn) btn.setAttribute('aria-label', esClave ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

function setFieldError(inputId, msg) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(`${inputId}-err`);
  if (!input) return;
  if (msg) {
    input.classList.add('input-error');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
  } else {
    input.classList.remove('input-error');
    if (err) err.classList.add('hidden');
  }
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
  } else {
    btn.disabled = false;
    if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
  }
}

function fechaHoyBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function isoFecha(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function formatearFechaCO(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function esFechaDisponible(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getDay() === 0) return false;
  if (FESTIVOS_CO_2026[iso]) return false;
  if (iso < fechaHoyBogota()) return false;
  return true;
}

function mesInicialCalendario() {
  const hoy = fechaHoyBogota();
  if (hoy.startsWith('2026-')) {
    return Number(hoy.slice(5, 7)) - 1;
  }
  return hoy > '2026-12-31' ? 11 : 0;
}

function cambiarMesCalendario(delta) {
  const siguiente = calendarioMes + delta;
  if (siguiente < 0 || siguiente > 11) return;
  calendarioMes = siguiente;
  renderCalendarioServicio();
}

function seleccionarFechaServicio(iso) {
  if (!esFechaDisponible(iso)) return;
  fechaServicioSeleccionada = iso;
  renderCalendarioServicio();
}

function renderCalendarioServicio() {
  const wrap = document.getElementById('calendarWrap');
  if (!wrap) return;

  const anio = 2026;
  const primerDia = new Date(anio, calendarioMes, 1);
  const diasEnMes = new Date(anio, calendarioMes + 1, 0).getDate();
  const offsetLunes = (primerDia.getDay() + 6) % 7;

  let celdas = '';
  for (let i = 0; i < offsetLunes; i++) {
    celdas += '<div class="cal-cell cal-empty"></div>';
  }

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const iso = isoFecha(anio, calendarioMes, dia);
    const festivo = FESTIVOS_CO_2026[iso];
    const domingo = new Date(anio, calendarioMes, dia).getDay() === 0;
    const pasada = iso < fechaHoyBogota();
    const disponible = esFechaDisponible(iso);
    const seleccionada = fechaServicioSeleccionada === iso;
    const esHoy = iso === fechaHoyBogota();
    const clases = [
      'cal-cell',
      disponible ? 'cal-available' : 'cal-disabled',
      festivo ? 'cal-holiday' : '',
      domingo ? 'cal-sunday' : '',
      pasada ? 'cal-past' : '',
      esHoy ? 'cal-today' : '',
      seleccionada ? 'cal-selected' : ''
    ].filter(Boolean).join(' ');

    const titulo = festivo || (domingo ? 'Domingo' : (disponible ? 'Disponible' : 'No disponible'));
    const click = disponible ? `onclick="seleccionarFechaServicio('${iso}')"` : '';

    celdas += `
      <button type="button" class="${clases}" ${click} title="${titulo}" ${disponible ? '' : 'disabled'}>
        <span class="cal-num">${dia}</span>
        ${festivo ? '<span class="cal-dot"></span>' : ''}
      </button>
    `;
  }

  const fechaTexto = fechaServicioSeleccionada
    ? formatearFechaCO(fechaServicioSeleccionada)
    : 'Ninguna fecha seleccionada';

  wrap.innerHTML = `
    <div class="service-calendar">
      <div class="mb-3">
        <h3 class="mb-1 text-lg font-bold text-brand">Agenda 2026 · Colombia</h3>
        <p class="mb-0 text-sm text-muted">Elige el día del servicio. Festivos y domingos no están disponibles.</p>
      </div>
      <div class="cal-nav">
        <button type="button" class="btn-brand-outline px-3 py-1.5 text-sm" onclick="cambiarMesCalendario(-1)" ${calendarioMes === 0 ? 'disabled' : ''}>
          ‹
        </button>
        <strong>${MESES_ES[calendarioMes]} ${anio}</strong>
        <button type="button" class="btn-brand-outline px-3 py-1.5 text-sm" onclick="cambiarMesCalendario(1)" ${calendarioMes === 11 ? 'disabled' : ''}>
          ›
        </button>
      </div>
      <div class="cal-week">
        ${DIAS_ES.map(d => `<div class="cal-weekday">${d}</div>`).join('')}
      </div>
      <div class="cal-grid">
        ${celdas}
      </div>
      <div class="cal-legend mt-3">
        <span><i class="cal-swatch cal-swatch-ok"></i> Hábil</span>
        <span><i class="cal-swatch cal-swatch-holiday"></i> Festivo</span>
        <span><i class="cal-swatch cal-swatch-off"></i> Domingo / no disponible</span>
        <span><i class="cal-swatch cal-swatch-sel"></i> Seleccionado</span>
      </div>
      <p class="cal-selected-label mt-3 mb-0">
        <i class="fas fa-calendar-check mr-2"></i>${fechaTexto}
      </p>
    </div>
  `;
}

async function cargarProductos() {
  const prices = ['precio-alimentos', 'precio-medicamentos', 'precio-peluqueria', 'precio-guarderia'];
  prices.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="skeleton skeleton-line inline-block w-28 align-middle"></span>';
  });
  try {
    const res = await fetch(`${API_BASE_URL}/api/products?limit=200`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    PRODUCTOS = {};
    items.forEach(p => {
      const key = p.categoria
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
      if (!PRODUCTOS[key]) PRODUCTOS[key] = [];
      PRODUCTOS[key].push({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        descripcion: p.descripcion,
        imagen: p.imagen,
        categoria: p.categoria
      });
    });
  } catch (err) {
    console.warn('No se pudo cargar productos desde la API, usando catálogo local:', err.message);
    PRODUCTOS = { ...PRODUCTOS_LOCALES };
  }
  actualizarPreciosCatalogo();
}

function actualizarPreciosCatalogo() {
  const mapa = {
    alimentos: 'precio-alimentos',
    medicamentos: 'precio-medicamentos',
    peluqueria: 'precio-peluqueria',
    guarderia: 'precio-guarderia'
  };
  Object.keys(mapa).forEach(key => {
    const el = document.getElementById(mapa[key]);
    const lista = PRODUCTOS[key];
    if (!el || !lista || lista.length === 0) return;
    const min = Math.min(...lista.map(p => p.precio));
    el.innerHTML = `Desde $${min.toLocaleString()} <span class="font-normal text-muted">· ${lista.length} ${lista.length === 1 ? 'opción' : 'opciones'}</span>`;
  });
}

// Verificar si el usuario está autenticado al cargar la página
document.addEventListener('DOMContentLoaded', function() {
  // Si estamos en dashboard.html, verificar autenticación
  if (window.location.pathname.includes('dashboard.html')) {
    checkAuth();
    actualizarContadorCarrito();
    cargarProductos();
  }
});

// Verificar autenticación
function checkAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    Swal.fire({
      icon: 'warning',
      title: 'Acceso denegado',
      text: 'Debes iniciar sesión para acceder a esta página',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'Ir al login'
    }).then(() => {
      window.location.href = 'login.html';
    });
  }
}

// Función de login usando backend
async function login() {
  const identifier = document.getElementById('identifier').value.trim();
  const password = document.getElementById('password').value;

  setFieldError('identifier', '');
  setFieldError('password', '');

  // Validaciones del frontend
  if (!identifier) {
    setFieldError('identifier', 'Ingresa tu usuario o correo');
    return;
  }
  if (!password) {
    setFieldError('password', 'Ingresa tu contraseña');
    return;
  }

  setButtonLoading('loginBtn', true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, password })
    });

    const data = await response.json();

    if (data.error) {
      Swal.fire({
        icon: 'error',
        title: 'Error de autenticación',
        text: data.error,
        confirmButtonColor: '#3085d6'
      });
      return;
    }

    // Login exitoso
    localStorage.setItem('authToken', data.token);
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('username', data.username || identifier);
    const role = data.role || 'user';
    localStorage.setItem('role', role);

    Swal.fire({
      icon: 'success',
      title: '¡Bienvenido!',
      text: data.message || `Inicio de sesión exitoso como ${data.username || identifier}`,
      confirmButtonColor: '#28a745',
      confirmButtonText: 'Continuar'
    }).then(() => {
      window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
    });
  } catch (error) {
    console.error('Error en login:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo conectar con el servidor',
      confirmButtonColor: '#3085d6'
    });
  } finally {
    setButtonLoading('loginBtn', false);
  }
}

// Función de registro usando backend
async function register() {
  const username = document.getElementById('newUsername').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;

  setFieldError('newUsername', '');
  setFieldError('newEmail', '');
  setFieldError('newPassword', '');

  // Validaciones del frontend
  if (!username) {
    setFieldError('newUsername', 'Elige un nombre de usuario');
    return;
  }
  if (!email) {
    setFieldError('newEmail', 'Ingresa tu correo electrónico');
    return;
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    setFieldError('newEmail', 'Formato de email inválido');
    return;
  }

  if (!password) {
    setFieldError('newPassword', 'Crea una contraseña');
    return;
  }
  if (password.length < 6) {
    setFieldError('newPassword', 'La contraseña debe tener al menos 6 caracteres');
    return;
  }

  setButtonLoading('registerBtn', true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (data.error) {
      Swal.fire({
        icon: 'error',
        title: 'Error en el registro',
        text: data.error,
        confirmButtonColor: '#3085d6'
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: '¡Registro exitoso!',
      text: data.message || 'Tu cuenta ha sido creada correctamente',
      confirmButtonColor: '#28a745',
      confirmButtonText: 'Continuar'
    }).then(() => {
      window.location.href = 'login.html';
    });
  } catch (error) {
    console.error('Error en registro:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo conectar con el servidor',
      confirmButtonColor: '#3085d6'
    });
  } finally {
    setButtonLoading('registerBtn', false);
  }
}

function logout() {
  Swal.fire({
    title: '¿Cerrar sesión?',
    text: '¿Estás seguro de que quieres salir?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, cerrar sesión',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      // Limpiar datos de autenticación
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
      localStorage.removeItem('role');

      Swal.fire({
        icon: 'success',
        title: 'Sesión cerrada',
        text: 'Has cerrado sesión exitosamente',
        confirmButtonColor: '#28a745',
        confirmButtonText: 'Continuar'
      }).then(() => {
        window.location.href = 'index.html';
      });
    }
  });
}

// Funciones del catálogo
async function showProducts(categoria) {
  const modalTitle = document.getElementById('modalTitle');
  const productsContainer = document.getElementById('productsContainer');
  const conAgenda = CATEGORIAS_CON_AGENDA.includes(categoria);

  // Esperar brevemente a que el catálogo termine de cargar antes de decir que no hay productos
  let productos = PRODUCTOS[categoria];
  if (!productos || productos.length === 0) {
    for (let i = 0; i < 20 && (!productos || productos.length === 0); i++) {
      await new Promise(r => setTimeout(r, 100));
      productos = PRODUCTOS[categoria];
    }
  }

  if (!productos || productos.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'Sin productos',
      text: 'Esta categoría no tiene productos disponibles por el momento',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  categoriaServicioActual = conAgenda ? categoria : null;
  fechaServicioSeleccionada = null;
  calendarioMes = mesInicialCalendario();

  modalTitle.innerHTML = conAgenda
    ? `<i class="fas fa-calendar-alt mr-2"></i>${productos[0].categoria} · Reservar fecha`
    : `<i class="fas fa-boxes mr-2"></i>Productos de ${productos[0].categoria}`;

  let productosHTML = '';
  const bandClass = { alimentos: 'bg-warn', medicamentos: 'bg-danger', peluqueria: 'bg-info', guarderia: 'bg-success' }[categoria] || 'bg-brand';
  const bandIcon = { alimentos: 'fa-bone', medicamentos: 'fa-pills', peluqueria: 'fa-cut', guarderia: 'fa-home' }[categoria] || 'fa-box';

  productos.forEach(producto => {
    const args = conAgenda
      ? `${producto.id}, '${producto.nombre}', ${producto.precio}, true`
      : `${producto.id}, '${producto.nombre}', ${producto.precio}`;
    const img = producto.imagen
      ? `<img src="${esc(producto.imagen)}" alt="${esc(producto.nombre)}" loading="lazy" class="absolute inset-0 h-full w-full object-cover" onerror="this.remove()">`
      : '';
    productosHTML += `
      <div class="product-card h-full">
        <div class="relative flex h-28 items-center justify-center ${bandClass}">
          <i class="fas ${bandIcon} fa-3x text-white/85"></i>
          <span class="absolute top-2 right-3 text-xs font-semibold text-white/90">${esc(producto.categoria)}</span>
          ${img}
        </div>
        <div class="flex flex-1 flex-col p-4 text-center">
          <h3 class="mb-1 text-lg font-bold text-brand">${esc(producto.nombre)}</h3>
          <p class="mb-2 text-sm text-muted">${esc(producto.descripcion)}</p>
          <div class="product-price mb-3">
            <span class="text-xl font-bold text-success">$${producto.precio.toLocaleString()}</span>
          </div>
          <button onclick="agregarAlCarrito(${args})" class="btn-brand-success mt-auto w-full py-2.5">
            <i class="fas fa-cart-plus mr-2"></i>${conAgenda ? 'Reservar' : 'Agregar al Carrito'}
          </button>
        </div>
      </div>
    `;
  });

  productsContainer.innerHTML = conAgenda
    ? `<div class="col-span-full" id="calendarWrap"></div><div class="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">${productosHTML}</div>`
    : productosHTML;

  if (conAgenda) renderCalendarioServicio();
  openModal('productsModal');
}

// Funciones del carrito
function agregarAlCarrito(id, nombre, precio, requiereFecha) {
  let fecha = null;
  if (requiereFecha) {
    if (!fechaServicioSeleccionada) {
      Swal.fire({
        icon: 'warning',
        title: 'Selecciona una fecha',
        text: 'Elige un día hábil de 2026 en el calendario de Colombia',
        confirmButtonColor: '#0e7c7b'
      });
      return;
    }
    fecha = fechaServicioSeleccionada;
  }

  const itemExistente = carrito.find(item => item.id === id && (item.fecha || null) === fecha);

  if (itemExistente) {
    itemExistente.cantidad += 1;
  } else {
    carrito.push({ id, nombre, precio, cantidad: 1, fecha });
  }

  actualizarContadorCarrito();

  const extra = fecha ? ` para el ${formatearFechaCO(fecha)}` : '';
  Swal.fire({
    icon: 'success',
    title: requiereFecha ? 'Servicio reservado' : 'Producto agregado',
    text: `${nombre} se agregó al carrito${extra}`,
    confirmButtonColor: '#0e7c7b',
    timer: 1800,
    showConfirmButton: false
  });
}

function actualizarContadorCarrito() {
  const totalItems = carrito.reduce((total, item) => total + item.cantidad, 0);
  localStorage.setItem('mundoPetsCart', JSON.stringify(carrito));
  const ui = uiStore();
  if (ui) ui.cartCount = totalItems;
  const counter = document.getElementById('cart-count');
  if (!counter) return;
  counter.textContent = totalItems;
  counter.classList.remove('cart-bump');
  void counter.offsetWidth;
  counter.classList.add('cart-bump');
}

function showCart() {
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');

  if (carrito.length === 0) {
    cartItems.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true"><i class="fas fa-paw fa-2x"></i></div>
        <strong class="text-brand">Tu carrito está vacío</strong>
        <span class="text-sm">Explora el catálogo y encuentra algo especial para tu mascota.</span>
      </div>
    `;
    cartTotal.textContent = '0';
  } else {
    let itemsHTML = '';
    let total = 0;

    carrito.forEach(item => {
      const subtotal = item.precio * item.cantidad;
      total += subtotal;

      itemsHTML += `
        <div class="mb-3 rounded-card border border-gray-100 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <h5 class="mb-1 font-bold">${esc(item.nombre)}</h5>
              <p class="mb-0 text-muted">$${item.precio.toLocaleString()} x ${item.cantidad}</p>
              ${item.fecha ? `<p class="mt-1 mb-0 text-sm text-brand"><i class="fas fa-calendar-day mr-1"></i>${formatearFechaCO(item.fecha)}</p>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <button onclick="cambiarCantidad(${item.id}, -1, '${item.fecha || ''}')" class="btn-brand-outline px-3 py-1.5 text-sm" aria-label="Disminuir cantidad de ${esc(item.nombre)}">
                <i class="fas fa-minus"></i>
              </button>
              <span class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold">${item.cantidad}</span>
              <button onclick="cambiarCantidad(${item.id}, 1, '${item.fecha || ''}')" class="btn-brand-outline px-3 py-1.5 text-sm" aria-label="Aumentar cantidad de ${esc(item.nombre)}">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div class="text-center font-bold text-success">$${subtotal.toLocaleString()}</div>
            <button onclick="eliminarDelCarrito(${item.id}, '${item.fecha || ''}')" class="inline-flex items-center justify-center gap-2 rounded-full border-2 border-danger/40 px-3 py-1.5 text-danger transition duration-200 hover:bg-danger hover:text-white" aria-label="Eliminar ${esc(item.nombre)} del carrito">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    });

    cartItems.innerHTML = itemsHTML;
    cartTotal.textContent = total.toLocaleString();
  }

  openModal('cartModal');
}

function mismaLinea(item, id, fecha) {
  return item.id === id && (item.fecha || '') === (fecha || '');
}

function cambiarCantidad(id, cambio, fecha) {
  const item = carrito.find(linea => mismaLinea(linea, id, fecha));
  if (item) {
    item.cantidad += cambio;
    if (item.cantidad <= 0) {
      eliminarDelCarrito(id, fecha);
    } else {
      actualizarContadorCarrito();
      showCart();
    }
  }
}

function eliminarDelCarrito(id, fecha) {
  carrito = carrito.filter(item => !mismaLinea(item, id, fecha));
  actualizarContadorCarrito();
  showCart();
}

// Funciones de checkout
function checkout() {
  if (carrito.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Carrito vacío',
      text: 'Agrega productos antes de proceder al pago',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  closeModal('cartModal');

  const checkoutSummary = document.getElementById('checkoutSummary');

  // Generar resumen de la compra
  let summaryHTML = '';
  let total = 0;

  carrito.forEach(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;

    summaryHTML += `
      <div class="flex items-center justify-between gap-2 border-b border-gray-200 py-2">
        <span class="font-medium">${esc(item.nombre)} x ${item.cantidad}${item.fecha ? `<br><small class="text-muted">${formatearFechaCO(item.fecha)}</small>` : ''}</span>
        <span class="font-bold text-success">$${subtotal.toLocaleString()}</span>
      </div>
    `;
  });

  summaryHTML += `
    <div class="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
      <span class="text-lg font-bold text-brand">Total:</span>
      <span class="text-xl font-bold text-success">$${total.toLocaleString()}</span>
    </div>
  `;

  checkoutSummary.innerHTML = summaryHTML;
  openModal('checkoutModal');
}

function selectPayment(metodo) {
  metodoPagoSeleccionado = metodo;

  // Remover selección previa
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.classList.remove('payment-selected');
  });

  // Seleccionar botón actual
  event.target.closest('.payment-btn').classList.add('payment-selected');
}

async function processPayment() {
  if (!metodoPagoSeleccionado) {
    Swal.fire({
      icon: 'warning',
      title: 'Método de pago requerido',
      text: 'Selecciona un método de pago',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  const total = carrito.reduce((total, item) => total + (item.precio * item.cantidad), 0);

  const items = carrito.map(item => ({
    product_id: item.id,
    quantity: item.cantidad,
    date: item.fecha || null
  }));

  Swal.fire({
    icon: 'info',
    title: 'Creando pedido',
    text: 'Validando productos y reserva...',
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify({ items, payment_method: metodoPagoSeleccionado })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo crear el pedido');

    // Si el método es en línea (PSE / Mercado Pago), simular la confirmación del proveedor
    let mensaje = `Pedido #${data.order_id} por $${Number(data.total).toLocaleString()} registrado como pendiente.`;
    let titulo = '¡Pedido creado!';
    if (metodoPagoSeleccionado !== 'efectivo') {
      Swal.showLoading();
      try {
        const payRes = await fetch(`${API_BASE_URL}/api/orders/${data.order_id}/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
          },
          body: JSON.stringify({ provider: metodoPagoSeleccionado })
        });
        const pay = await payRes.json();
        if (!payRes.ok) throw new Error(pay.error || 'No se pudo iniciar el pago');

        const webRes = await fetch(`${API_BASE_URL}/api/payments/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_id: pay.payment_id, status: 'paid' })
        });
        const web = await webRes.json();
        if (!webRes.ok) throw new Error(web.error || 'No se pudo confirmar el pago');

        titulo = '¡Pago exitoso!';
        mensaje = `Pago de $${Number(data.total).toLocaleString()} confirmado para el pedido #${data.order_id}.`;
      } catch (pagoError) {
        titulo = 'Pedido creado, pago pendiente';
        mensaje = `Pedido #${data.order_id} por $${Number(data.total).toLocaleString()} registrado. No se confirmó el pago: ${pagoError.message}`;
      }
    } else {
      mensaje = `Pedido #${data.order_id} por $${Number(data.total).toLocaleString()} registrado. Realiza el pago en tienda.`;
    }

    Swal.close();
    Swal.fire({
      icon: 'success',
      title: titulo,
      text: mensaje,
      confirmButtonColor: '#28a745',
      confirmButtonText: 'Continuar'
    }).then(() => {
      // Limpiar carrito
      carrito = [];
      localStorage.removeItem('mundoPetsCart');
      metodoPagoSeleccionado = null;
      actualizarContadorCarrito();
      closeModal('checkoutModal');

      // Redirigir al dashboard
      window.location.href = 'dashboard.html';
    });
  } catch (error) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'No se pudo crear el pedido',
      text: error.message,
      confirmButtonColor: '#b42318'
    });
  }
}