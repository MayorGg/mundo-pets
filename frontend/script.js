// URL base del backend (asegúrate de levantar el servidor en este puerto)
const API_BASE_URL = 'http://localhost:5000';

// Base de datos de productos
const PRODUCTOS = {
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

let carrito = [];
let metodoPagoSeleccionado = null;
let fechaServicioSeleccionada = null;
let calendarioMes = 7;
let categoriaServicioActual = null;

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
    const clases = [
      'cal-cell',
      disponible ? 'cal-available' : 'cal-disabled',
      festivo ? 'cal-holiday' : '',
      domingo ? 'cal-sunday' : '',
      pasada ? 'cal-past' : '',
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
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="h5 text-primary mb-1">Agenda 2026 · Colombia</h3>
          <p class="small text-muted mb-0">Elige el día del servicio. Festivos y domingos no están disponibles.</p>
        </div>
      </div>
      <div class="cal-nav">
        <button type="button" class="btn btn-outline-primary btn-sm rounded-pill" onclick="cambiarMesCalendario(-1)" ${calendarioMes === 0 ? 'disabled' : ''}>
          ‹
        </button>
        <strong>${MESES_ES[calendarioMes]} ${anio}</strong>
        <button type="button" class="btn btn-outline-primary btn-sm rounded-pill" onclick="cambiarMesCalendario(1)" ${calendarioMes === 11 ? 'disabled' : ''}>
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
        <i class="fas fa-calendar-check me-2"></i>${fechaTexto}
      </p>
    </div>
  `;
}

// Verificar si el usuario está autenticado al cargar la página
document.addEventListener('DOMContentLoaded', function() {
  // Si estamos en dashboard.html, verificar autenticación
  if (window.location.pathname.includes('dashboard.html')) {
    checkAuth();
    actualizarContadorCarrito();
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
  const identifier = document.getElementById('identifier').value;
  const password = document.getElementById('password').value;

  // Validaciones del frontend
  if (!identifier || !password) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Usuario/Email y contraseña son requeridos',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

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
    localStorage.setItem('username', data.username || identifier);
    
    Swal.fire({
      icon: 'success',
      title: '¡Bienvenido!',
      text: data.message || `Inicio de sesión exitoso como ${data.username || identifier}`,
      confirmButtonColor: '#28a745',
      confirmButtonText: 'Continuar'
    }).then(() => {
      window.location.href = 'dashboard.html';
    });
  } catch (error) {
    console.error('Error en login:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo conectar con el servidor',
      confirmButtonColor: '#3085d6'
    });
  }
}

// Función de registro usando backend
async function register() {
  const username = document.getElementById('newUsername').value;
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;

  // Validaciones del frontend
  if (!username || !email || !password) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Todos los campos son requeridos',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Formato de email inválido',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

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
      localStorage.removeItem('username');
      
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
function showProducts(categoria) {
  const modal = new bootstrap.Modal(document.getElementById('productsModal'));
  const modalTitle = document.getElementById('modalTitle');
  const productsContainer = document.getElementById('productsContainer');
  const productos = PRODUCTOS[categoria];
  const conAgenda = CATEGORIAS_CON_AGENDA.includes(categoria);

  categoriaServicioActual = conAgenda ? categoria : null;
  fechaServicioSeleccionada = null;
  calendarioMes = mesInicialCalendario();

  modalTitle.innerHTML = conAgenda
    ? `<i class="fas fa-calendar-alt me-2"></i>${productos[0].categoria} · Reservar fecha`
    : `<i class="fas fa-boxes me-2"></i>Productos de ${productos[0].categoria}`;

  let productosHTML = '';
  productos.forEach(producto => {
    const args = conAgenda
      ? `${producto.id}, '${producto.nombre}', ${producto.precio}, true`
      : `${producto.id}, '${producto.nombre}', ${producto.precio}`;
    productosHTML += `
      <div class="col-lg-4 col-md-6 col-sm-12">
        <div class="card product-card h-100 shadow-hover">
          <div class="card-body text-center p-4">
            <div class="product-icon mb-3">
              <i class="fas fa-box fa-3x text-primary"></i>
            </div>
            <h3 class="card-title h5 text-primary">${producto.nombre}</h3>
            <p class="card-text text-muted small">${producto.descripcion}</p>
            <div class="product-price mb-3">
              <span class="h4 fw-bold text-success">$${producto.precio.toLocaleString()}</span>
            </div>
            <button onclick="agregarAlCarrito(${args})" class="btn btn-success w-100">
              <i class="fas fa-cart-plus me-2"></i>${conAgenda ? 'Reservar' : 'Agregar al Carrito'}
            </button>
          </div>
        </div>
      </div>
    `;
  });

  productsContainer.innerHTML = conAgenda
    ? `<div class="col-12" id="calendarWrap"></div><div class="col-12"><div class="row g-4">${productosHTML}</div></div>`
    : productosHTML;

  if (conAgenda) renderCalendarioServicio();
  modal.show();
}

function closeModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById('productsModal'));
  if (modal) modal.hide();
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
  document.getElementById('cart-count').textContent = totalItems;
}

function showCart() {
  const modal = new bootstrap.Modal(document.getElementById('cartModal'));
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  
  if (carrito.length === 0) {
    cartItems.innerHTML = `
      <div class="text-center py-5">
        <i class="fas fa-shopping-cart fa-4x text-muted mb-3"></i>
        <p class="text-muted">Tu carrito está vacío</p>
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
        <div class="card mb-3">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-md-4">
                <h5 class="card-title mb-1">${item.nombre}</h5>
                <p class="text-muted mb-0">$${item.precio.toLocaleString()} x ${item.cantidad}</p>
                ${item.fecha ? `<p class="small text-primary mb-0 mt-1"><i class="fas fa-calendar-day me-1"></i>${formatearFechaCO(item.fecha)}</p>` : ''}
              </div>
              <div class="col-md-4 text-center">
                <div class="btn-group" role="group">
                  <button onclick="cambiarCantidad(${item.id}, -1, '${item.fecha || ''}')" class="btn btn-outline-primary btn-sm">
                    <i class="fas fa-minus"></i>
                  </button>
                  <span class="btn btn-outline-secondary btn-sm disabled">${item.cantidad}</span>
                  <button onclick="cambiarCantidad(${item.id}, 1, '${item.fecha || ''}')" class="btn btn-outline-primary btn-sm">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              <div class="col-md-2 text-center">
                <span class="h6 text-success">$${subtotal.toLocaleString()}</span>
              </div>
              <div class="col-md-2 text-center">
                <button onclick="eliminarDelCarrito(${item.id}, '${item.fecha || ''}')" class="btn btn-outline-danger btn-sm">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    cartItems.innerHTML = itemsHTML;
    cartTotal.textContent = total.toLocaleString();
  }
  
  modal.show();
}

function closeCartModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById('cartModal'));
  if (modal) modal.hide();
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
  
  closeCartModal();
  
  const modal = new bootstrap.Modal(document.getElementById('checkoutModal'));
  const checkoutSummary = document.getElementById('checkoutSummary');
  
  // Generar resumen de la compra
  let summaryHTML = '';
  let total = 0;
  
  carrito.forEach(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    
    summaryHTML += `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <span class="fw-medium">${item.nombre} x ${item.cantidad}${item.fecha ? `<br><small class="text-muted">${formatearFechaCO(item.fecha)}</small>` : ''}</span>
        <span class="text-success fw-bold">$${subtotal.toLocaleString()}</span>
      </div>
    `;
  });
  
  summaryHTML += `
    <div class="d-flex justify-content-between align-items-center py-3 border-top mt-3">
      <span class="h5 mb-0 text-primary">Total:</span>
      <span class="h4 mb-0 text-success fw-bold">$${total.toLocaleString()}</span>
    </div>
  `;
  
  checkoutSummary.innerHTML = summaryHTML;
  modal.show();
}

function closeCheckoutModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById('checkoutModal'));
  if (modal) modal.hide();
}

function selectPayment(metodo) {
  metodoPagoSeleccionado = metodo;
  
  // Remover selección previa
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline-primary');
  });
  
  // Seleccionar botón actual
  event.target.closest('.payment-btn').classList.remove('btn-outline-primary');
  event.target.closest('.payment-btn').classList.add('btn-primary');
}

function processPayment() {
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
  
  Swal.fire({
    icon: 'info',
    title: 'Procesando Pago',
    text: `Redirigiendo a ${metodoPagoSeleccionado.toUpperCase()}...`,
    showConfirmButton: false,
    timer: 2000
  }).then(() => {
    // Aquí es donde conectarías con PSE, Mercado Pago, etc.
    Swal.fire({
      icon: 'success',
      title: '¡Pago Exitoso!',
      text: `Tu compra por $${total.toLocaleString()} ha sido procesada`,
      confirmButtonColor: '#28a745',
      confirmButtonText: 'Continuar'
    }).then(() => {
      // Limpiar carrito
      carrito = [];
      actualizarContadorCarrito();
      closeCheckoutModal();
      
      // Redirigir al dashboard
      window.location.href = 'dashboard.html';
    });
  });
}

// Cerrar modales al hacer clic fuera de ellos
window.onclick = function(event) {
  const productsModal = document.getElementById('productsModal');
  const cartModal = document.getElementById('cartModal');
  const checkoutModal = document.getElementById('checkoutModal');
  
  if (event.target === productsModal) {
    productsModal.style.display = 'none';
  }
  if (event.target === cartModal) {
    cartModal.style.display = 'none';
  }
  if (event.target === checkoutModal) {
    checkoutModal.style.display = 'none';
  }
}
