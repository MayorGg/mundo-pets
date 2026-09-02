// URL base del backend
const API_BASE_URL = 'http://localhost:5000';

let productosAdmin = [];
let categoriasAdmin = [];
let usuariosAdmin = [];

function getToken() {
  return localStorage.getItem('authToken');
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function tryRefresh() {
  const rt = localStorage.getItem('refreshToken');
  if (!rt) return false;
  try {
    const r = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt })
    });
    const d = await r.json();
    if (!r.ok || !d.token) return false;
    localStorage.setItem('authToken', d.token);
    if (d.role) localStorage.setItem('role', d.role);
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(url, options = {}) {
  const build = (token) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return { ...options, headers };
  };

  let res = await fetch(`${API_BASE_URL}${url}`, build(getToken()));

  // Token expirado: intentar renovar con el refresh token una sola vez
  if (res.status === 401 && (await tryRefresh())) {
    res = await fetch(`${API_BASE_URL}${url}`, build(getToken()));
  }

  if (res.status === 401 || res.status === 403) {
    logoutAdmin();
    throw new Error('No autorizado');
  }
  return res.json();
}

// Modales
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const focusable = el.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  ['productoModal', 'categoriaModal', 'usuarioModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) closeModal(id);
  });
});

// Navegación entre secciones
function mostrarSeccion(name) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.add('hidden'));
  const sec = document.getElementById('seccion-' + name);
  if (sec) sec.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.nav === name;
    btn.classList.toggle('bg-gradient-primary', isActive);
    btn.classList.toggle('text-white', isActive);
    btn.classList.toggle('shadow-card', isActive);
    btn.classList.toggle('text-brand', !isActive);
    btn.classList.toggle('hover:bg-brand-soft', !isActive);
  });
}

// Carga inicial
document.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const role = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    window.location.href = 'login.html';
    return;
  }
  mostrarSeccion('resumen');
  cargarStats();
  cargarProductosAdmin();
  cargarCategorias();
  cargarUsuarios();
});

// Stats
async function cargarStats() {
  try {
    const data = await apiFetch('/api/admin/stats');
    document.getElementById('stat-usuarios').textContent = data.usuarios;
    document.getElementById('stat-productos').textContent = data.productos;
    document.getElementById('stat-categorias').textContent = data.categorias;
  } catch (err) {
    console.error('Error en stats:', err);
  }
}

// Productos
async function cargarProductosAdmin() {
  try {
    const data = await apiFetch('/api/admin/products');
    productosAdmin = data;
    renderProductos();
  } catch (err) {
    console.error('Error cargando productos:', err);
  }
}

function renderProductos() {
  const tbody = document.getElementById('tbody-productos');
  if (!productosAdmin.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-muted">No hay productos. Crea uno con "Nuevo Producto".</td></tr>`;
    return;
  }
  tbody.innerHTML = productosAdmin.map(p => `
    <tr class="transition hover:bg-brand-soft/40">
      <td class="px-4 py-3 text-muted">${p.id}</td>
      <td class="px-4 py-3 font-semibold text-ink">${esc(p.nombre)}</td>
      <td class="px-4 py-3 text-muted">${esc(p.categoria)}</td>
      <td class="px-4 py-3 font-semibold text-success">$${Number(p.precio).toLocaleString()}</td>
      <td class="px-4 py-3">${p.requiere_fecha
        ? '<span class="rounded-full bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">Fecha</span>'
        : '<span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-muted">No</span>'}</td>
      <td class="px-4 py-3">${p.activo
        ? '<span class="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Activo</span>'
        : '<span class="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">Inactivo</span>'}</td>
      <td class="px-4 py-3">
        <div class="flex justify-end gap-2">
          <button type="button" onclick="abrirModalProducto(${p.id})" class="btn-brand-outline px-3 py-1.5 text-sm" aria-label="Editar ${esc(p.nombre)}">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" onclick="eliminarProducto(${p.id})" class="inline-flex items-center justify-center gap-2 rounded-full border-2 border-danger/40 px-3 py-1.5 text-sm text-danger transition duration-200 hover:bg-danger hover:text-white" aria-label="Eliminar ${esc(p.nombre)}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function abrirModalProducto(id) {
  const esEdicion = Number.isInteger(id);
  document.getElementById('prodId').value = esEdicion ? id : '';
  document.getElementById('prodNombre').value = '';
  document.getElementById('prodCategoria').value = 'Alimentos';
  document.getElementById('prodPrecio').value = '';
  document.getElementById('prodDescripcion').value = '';
  document.getElementById('prodFecha').checked = false;
  document.getElementById('prodActivo').checked = true;
  document.getElementById('productoModalTitle').innerHTML =
    `<i class="fas fa-${esEdicion ? 'pen' : 'plus'} mr-2"></i>${esEdicion ? 'Editar Producto' : 'Nuevo Producto'}`;

  if (esEdicion) {
    const p = productosAdmin.find(x => x.id === id);
    if (p) {
      document.getElementById('prodNombre').value = p.nombre;
      document.getElementById('prodCategoria').value = p.categoria;
      document.getElementById('prodPrecio').value = Number(p.precio);
      document.getElementById('prodDescripcion').value = p.descripcion || '';
      document.getElementById('prodFecha').checked = !!p.requiere_fecha;
      document.getElementById('prodActivo').checked = !!p.activo;
    }
  }
  openModal('productoModal');
}

async function guardarProducto() {
  const id = document.getElementById('prodId').value;
  const payload = {
    nombre: document.getElementById('prodNombre').value.trim(),
    categoria: document.getElementById('prodCategoria').value,
    precio: Number(document.getElementById('prodPrecio').value),
    descripcion: document.getElementById('prodDescripcion').value.trim(),
    requiere_fecha: document.getElementById('prodFecha').checked,
    activo: document.getElementById('prodActivo').checked
  };

  if (!payload.nombre) {
    Swal.fire({ icon: 'warning', title: 'Falta el nombre', text: 'Escribe el nombre del producto', confirmButtonColor: '#3085d6' });
    return;
  }
  if (!Number.isFinite(payload.precio) || payload.precio < 0) {
    Swal.fire({ icon: 'warning', title: 'Precio inválido', text: 'Ingresa un precio válido', confirmButtonColor: '#3085d6' });
    return;
  }

  try {
    if (id) {
      await apiFetch(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('productoModal');
    await cargarProductosAdmin();
    cargarStats();
    Swal.fire({ icon: 'success', title: 'Guardado', text: 'Producto guardado correctamente', confirmButtonColor: '#28a745', timer: 1600, showConfirmButton: false });
  } catch (err) {
    console.error('Error guardando producto:', err);
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el producto', confirmButtonColor: '#3085d6' });
  }
}

function eliminarProducto(id) {
  const p = productosAdmin.find(x => x.id === id);
  Swal.fire({
    title: '¿Eliminar producto?',
    text: p ? `"${p.nombre}" se eliminará del catálogo` : 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#b42318',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      await cargarProductosAdmin();
      cargarStats();
      Swal.fire({ icon: 'success', title: 'Eliminado', text: 'Producto eliminado', confirmButtonColor: '#28a745', timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.error('Error eliminando producto:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar el producto', confirmButtonColor: '#3085d6' });
    }
  });
}

// Categorías
async function cargarCategorias() {
  try {
    const data = await apiFetch('/api/admin/categories');
    categoriasAdmin = data;
    renderCategorias();
    poblarSelectCategorias();
  } catch (err) {
    console.error('Error cargando categorías:', err);
  }
}

function poblarSelectCategorias() {
  const sel = document.getElementById('prodCategoria');
  if (!sel) return;
  const actual = sel.value;
  if (!categoriasAdmin.length) {
    sel.innerHTML = '<option value="">Sin categorías</option>';
    return;
  }
  sel.innerHTML = categoriasAdmin.map(c => `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join('');
  if (actual && categoriasAdmin.some(c => c.nombre === actual)) sel.value = actual;
}

function renderCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  if (!categoriasAdmin.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-muted">No hay categorías. Crea una con "Nueva Categoría".</td></tr>`;
    return;
  }
  const colorMap = {
    warn: 'bg-warn text-ink',
    danger: 'bg-danger text-white',
    info: 'bg-info text-white',
    success: 'bg-success text-white',
    brand: 'bg-brand text-white',
    muted: 'bg-gray-200 text-muted'
  };
  const colorLabel = {
    warn: 'Dorado',
    danger: 'Rojo',
    info: 'Celeste',
    success: 'Verde',
    brand: 'Teal',
    muted: 'Gris'
  };
  tbody.innerHTML = categoriasAdmin.map(c => `
    <tr class="transition hover:bg-brand-soft/40">
      <td class="px-4 py-3 text-muted">${c.id}</td>
      <td class="px-4 py-3 font-semibold text-ink">${esc(c.nombre)}</td>
      <td class="px-4 py-3 text-muted">${esc(c.descripcion) || '–'}</td>
      <td class="px-4 py-3 text-center"><i class="fas ${esc(c.icono)} text-brand"></i></td>
      <td class="px-4 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[c.color] || colorMap.brand}">${colorLabel[c.color] || esc(c.color)}</span></td>
      <td class="px-4 py-3 text-center font-semibold ${Number(c.productos) > 0 ? 'text-success' : 'text-muted'}">${c.productos}</td>
      <td class="px-4 py-3">
        <div class="flex justify-end gap-2">
          <button type="button" onclick="abrirModalCategoria(${c.id})" class="btn-brand-outline px-3 py-1.5 text-sm" aria-label="Editar categoría ${esc(c.nombre)}">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" onclick="eliminarCategoria(${c.id})" class="inline-flex items-center justify-center gap-2 rounded-full border-2 border-danger/40 px-3 py-1.5 text-sm text-danger transition duration-200 hover:bg-danger hover:text-white" aria-label="Eliminar categoría ${esc(c.nombre)}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function abrirModalCategoria(id) {
  const esEdicion = Number.isInteger(id);
  document.getElementById('catId').value = esEdicion ? id : '';
  document.getElementById('catNombre').value = '';
  document.getElementById('catDescripcion').value = '';
  document.getElementById('catIcono').value = 'fa-tag';
  document.getElementById('catColor').value = 'brand';
  document.getElementById('categoriaModalTitle').innerHTML =
    `<i class="fas fa-${esEdicion ? 'pen' : 'plus'} mr-2"></i>${esEdicion ? 'Editar Categoría' : 'Nueva Categoría'}`;

  if (esEdicion) {
    const c = categoriasAdmin.find(x => x.id === id);
    if (c) {
      document.getElementById('catNombre').value = c.nombre;
      document.getElementById('catDescripcion').value = c.descripcion || '';
      document.getElementById('catIcono').value = c.icono;
      document.getElementById('catColor').value = c.color;
    }
  }
  openModal('categoriaModal');
}

async function guardarCategoria() {
  const id = document.getElementById('catId').value;
  const payload = {
    nombre: document.getElementById('catNombre').value.trim(),
    descripcion: document.getElementById('catDescripcion').value.trim(),
    icono: document.getElementById('catIcono').value,
    color: document.getElementById('catColor').value
  };

  if (!payload.nombre) {
    Swal.fire({ icon: 'warning', title: 'Falta el nombre', text: 'Escribe el nombre de la categoría', confirmButtonColor: '#3085d6' });
    return;
  }

  try {
    if (id) {
      await apiFetch(`/api/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('categoriaModal');
    await cargarCategorias();
    await cargarProductosAdmin();
    cargarStats();
    Swal.fire({ icon: 'success', title: 'Guardado', text: 'Categoría guardada correctamente', confirmButtonColor: '#28a745', timer: 1600, showConfirmButton: false });
  } catch (err) {
    console.error('Error guardando categoría:', err);
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo guardar la categoría', confirmButtonColor: '#3085d6' });
  }
}

function eliminarCategoria(id) {
  const c = categoriasAdmin.find(x => x.id === id);
  Swal.fire({
    title: '¿Eliminar categoría?',
    text: c ? `"${c.nombre}" se eliminará (${c.productos} producto(s) asociado(s)). Si tiene productos, primero debes moverlos.` : 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#b42318',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      const data = await apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      if (data.error) {
        Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: data.error, confirmButtonColor: '#3085d6' });
        return;
      }
      await cargarCategorias();
      await cargarProductosAdmin();
      cargarStats();
      Swal.fire({ icon: 'success', title: 'Eliminada', text: 'Categoría eliminada', confirmButtonColor: '#28a745', timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.error('Error eliminando categoría:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar la categoría', confirmButtonColor: '#3085d6' });
    }
  });
}

// Usuarios
async function cargarUsuarios() {
  try {
    const data = await apiFetch('/api/admin/users');
    usuariosAdmin = data;
    renderUsuarios();
  } catch (err) {
    console.error('Error cargando usuarios:', err);
  }
}

function renderUsuarios() {
  const tbody = document.getElementById('tbody-usuarios');
  const usuarios = usuariosAdmin;
  if (!usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-muted">No hay usuarios registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = usuarios.map(u => `
    <tr class="transition hover:bg-brand-soft/40">
      <td class="px-4 py-3 text-muted">${u.id}</td>
      <td class="px-4 py-3 font-semibold text-ink">${esc(u.username)}</td>
      <td class="px-4 py-3 text-muted">${esc(u.email)}</td>
      <td class="px-4 py-3">${u.role === 'admin'
        ? '<span class="rounded-full bg-gradient-primary px-2.5 py-1 text-xs font-semibold text-white">Admin</span>'
        : '<span class="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">Usuario</span>'}</td>
      <td class="px-4 py-3 text-muted">${u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO') : '–'}</td>
      <td class="px-4 py-3">
        <div class="flex justify-end gap-2">
          <button type="button" onclick="abrirModalUsuario(${u.id})" class="btn-brand-outline px-3 py-1.5 text-sm" aria-label="Editar permisos de ${esc(u.username)}" title="Cambiar permisos">
            <i class="fas fa-user-shield"></i>
          </button>
          <button type="button" onclick="eliminarUsuario(${u.id})" class="inline-flex items-center justify-center gap-2 rounded-full border-2 border-danger/40 px-3 py-1.5 text-sm text-danger transition duration-200 hover:bg-danger hover:text-white" aria-label="Eliminar usuario ${esc(u.username)}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function abrirModalUsuario(id) {
  const u = usuariosAdmin.find(x => x.id === id);
  if (!u) return;
  document.getElementById('usrId').value = u.id;
  document.getElementById('usrNombre').value = u.username;
  document.getElementById('usrEmail').value = u.email;
  document.getElementById('usrRol').value = u.role;
  openModal('usuarioModal');
}

async function guardarRolUsuario() {
  const id = document.getElementById('usrId').value;
  const role = document.getElementById('usrRol').value;
  const u = usuariosAdmin.find(x => x.id === Number(id));
  if (!u) return;
  if (role === u.role) {
    closeModal('usuarioModal');
    return;
  }
  const esAdminNuevo = role === 'admin';
  const accion = esAdminNuevo ? 'promover a administrador' : 'quitar permisos de administrador';
  const result = await Swal.fire({
    title: `¿${esAdminNuevo ? 'Promover' : 'Cambiar permisos'}?`,
    text: `Se ${accion} a "${u.username}". ${esAdminNuevo ? 'Podrá acceder al panel administrativo.' : 'Perderá el acceso al panel administrativo.'} Deberá iniciar sesión de nuevo.`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0e7c7b',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, guardar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;

  try {
    const data = await apiFetch(`/api/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
    if (data.error) {
      Swal.fire({ icon: 'error', title: 'No se pudo cambiar el rol', text: data.error, confirmButtonColor: '#3085d6' });
      return;
    }
    closeModal('usuarioModal');
    await cargarUsuarios();
    cargarStats();
    Swal.fire({ icon: 'success', title: 'Permisos actualizados', text: `"${u.username}" ahora es ${esAdminNuevo ? 'administrador' : 'usuario'}.`, confirmButtonColor: '#28a745', timer: 1800, showConfirmButton: false });
  } catch (err) {
    console.error('Error actualizando rol:', err);
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo actualizar el rol', confirmButtonColor: '#3085d6' });
  }
}

function eliminarUsuario(id) {
  Swal.fire({
    title: '¿Eliminar usuario?',
    text: 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#b42318',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      const data = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (data.error) {
        Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: data.error, confirmButtonColor: '#3085d6' });
        return;
      }
      await cargarUsuarios();
      cargarStats();
      Swal.fire({ icon: 'success', title: 'Eliminado', text: 'Usuario eliminado', confirmButtonColor: '#28a745', timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.error('Error eliminando usuario:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar el usuario', confirmButtonColor: '#3085d6' });
    }
  });
}

function logoutAdmin() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('role');
  localStorage.removeItem('username');
  window.location.href = 'index.html';
}