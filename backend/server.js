
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const mysql = require('mysql2/promise');
const multer = require('multer');
const sharp = require('sharp');
const { loginSchema, registerSchema, refreshSchema, productSchema, categorySchema, orderSchema } = require('./lib/schemas');
const { validate } = require('./lib/validate');

// Cargar variables de entorno según ambiente (dev -> .env, prod -> .env.production)
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENV_FILE = NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: path.join(__dirname, ENV_FILE) });

// Requerir el cliente Prisma DESPUÉS de cargar el entorno (lee DB_* del adapter)
const prisma = require('./lib/prisma');

const app = express();

// Headers de seguridad básicos (helmet) con CSP que no rompe el frontend vanilla
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'http://localhost:5000'],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compresión gzip/brotli de respuestas
app.use(compression());

// CORS restringido a orígenes reales (desde .env, separados por coma)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// Bloquear orígenes no permitidos antes de CORS (403 limpio)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: 'Origen no permitido por CORS' });
});
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Secreto JWT desde variable de entorno (sin fallback fijo en el código)
const SECRET = process.env.JWT_SECRET || (() => {
  console.warn('ADVERTENCIA: JWT_SECRET no está definido. Usando un secreto temporal que invalida los tokens al reiniciar.');
  return crypto.randomBytes(64).toString('hex');
})();
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '2h';
const REFRESH_EXPIRES = process.env.REFRESH_EXPIRES_IN || '7d';

// Rate limiting en rutas de autenticación (20 intentos cada 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
});
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Intenta de nuevo en unos minutos.' }
});

// ---- Caché corta en memoria para endpoints públicos ----
const CACHE_TTL = 30 * 1000; // 30 s
const cacheStore = new Map();
async function getCached(key, fn) {
  const hit = cacheStore.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const data = await fn();
  cacheStore.set(key, { at: Date.now(), data });
  return data;
}
function invalidateCache(...keys) {
  keys.forEach(k => cacheStore.delete(k));
}
// Invalida todo el catálogo público (products en todas las páginas + categories)
function invalidarCatalogo() {
  for (const k of [...cacheStore.keys()]) {
    if (k.startsWith('products:') || k === 'categories') cacheStore.delete(k);
  }
}

// ---- Paginación ----
function paginar(query, def) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || def));
  return { page, limit, offset: (page - 1) * limit };
}
function respuestaPaginada(items, total, page, limit) {
  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit))
  };
}

// ---- Subida de imágenes de producto (multer + sharp) ----
const PRODUCT_IMG_DIR = path.join(__dirname, '..', 'img', 'products');
fs.mkdirSync(PRODUCT_IMG_DIR, { recursive: true });
const uploadImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8 MB máx
});

// Servir el frontend (páginas HTML, CSS, JS) con Cache-Control correcto:
// - HTML: no-cache (se revalida siempre)
// - CSS/JS/imágenes/iconos versionados: cache largo inmutable
// - resto: cache corta
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(css|js|svg|webp|jpe?g|png|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Servir imágenes (fondo Mundo Pet, etc.)
app.use('/img', express.static(path.join(__dirname, '..', 'img'), {
  setHeaders(res, filePath) {
    if (/\.(webp|jpe?g|png|svg|gif|avif)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Favicon: los navegadores piden /favicon.ico por defecto; redirigir al SVG
app.get('/favicon.ico', (req, res) => res.redirect('/favicon.svg'));

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function esHashBcrypt(pwd) {
  return typeof pwd === 'string' && pwd.startsWith('$2');
}

function signAccessToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signRefreshToken(payload) {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, SECRET, { expiresIn: REFRESH_EXPIRES });
}

function tokenResponse(user) {
  const payload = { id: user.id, username: user.username, role: user.role || 'user' };
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    username: user.username,
    role: payload.role,
    message: user.message || 'OK'
  };
}

function registerWithJson(username, email, password) {
  const users = loadUsers();
  if (users.some(u => u.username === username || u.email === email)) {
    return { error: 'El nombre de usuario o email ya está registrado' };
  }
  const hash = bcrypt.hashSync(password, 10);
  users.push({ username, email, password: hash, role: 'user' });
  saveUsers(users);
  return tokenResponse({ username, role: 'user' });
}

function loginWithJson(identifier, password) {
  const users = loadUsers();
  const user = users.find(
    u => (u.username === identifier || u.email === identifier)
  );
  if (!user) return { error: 'Credenciales inválidas' };

  const ok = esHashBcrypt(user.password)
    ? bcrypt.compareSync(password, user.password)
    : user.password === password; // migración: contraseña en texto plano

  if (!ok) return { error: 'Credenciales inválidas' };

  // Migrar a hash si venía en texto plano
  if (!esHashBcrypt(user.password)) {
    user.password = bcrypt.hashSync(user.password, 10);
    saveUsers(users);
  }

  const role = user.role || 'user';
  return tokenResponse({ id: user.id, username: user.username, role });
}

// Configuración de conexión a MySQL (leída desde .env; hay fallback a users.json si no está disponible)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mundo_pets',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middlewares de autenticación y roles
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.tokenType === 'refresh') {
      return res.status(401).json({ error: 'Token de refresco no válido para esta operación' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
  });
}

// Renovar el access token con un refresh token válido
app.post('/api/auth/refresh', validate(refreshSchema), (req, res) => {
  const { refreshToken } = req.body;
  try {
    const decoded = jwt.verify(refreshToken, SECRET);
    if (decoded.tokenType !== 'refresh') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const payload = { id: decoded.id, username: decoded.username, role: decoded.role || 'user' };
    res.json({ token: signAccessToken(payload), role: payload.role });
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }
});

const PAYMENT_METHODS = new Set(['pse', 'mercadopago', 'efectivo']);

function parseReservationDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

app.post('/api/orders', requireAuth, validate(orderSchema), async (req, res) => {
  const { items, payment_method: paymentMethod } = req.body;
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ error: 'Método de pago no válido' });
  }
  if (!Number.isInteger(Number(req.user.id))) {
    return res.status(400).json({ error: 'La cuenta no tiene un identificador válido' });
  }

  const normalizedItems = items.map(item => ({
    productId: Number(item && (item.product_id ?? item.id)),
    quantity: Number(item && item.quantity),
    date: item && item.date ? item.date : (item && item.reservation_date ? item.reservation_date : null)
  }));

  const productIds = [...new Set(normalizedItems.map(item => item.productId))];
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await conn.query(
      `SELECT id, precio, requiere_fecha FROM products WHERE id IN (${placeholders}) AND activo = 1 FOR UPDATE`,
      productIds
    );
    const productsById = new Map(products.map(product => [product.id, product]));
    if (products.length !== productIds.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Uno o más productos ya no están disponibles' });
    }

    let total = 0;
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      const requiresDate = Boolean(product.requiere_fecha);
      if (requiresDate !== Boolean(item.date)) {
        await conn.rollback();
        return res.status(400).json({ error: `La fecha del producto ${item.productId} no es válida` });
      }
      if (item.date) {
        const reservationDate = parseReservationDate(item.date);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (!reservationDate || reservationDate <= today || reservationDate.getUTCDay() === 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'La fecha de reserva debe ser futura y no puede ser domingo' });
        }
      }
      total += Number(product.precio) * item.quantity;
    }
    total = Math.round(total * 100) / 100;

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, total, payment_method, order_status) VALUES (?, ?, ?, 'pending')`,
      [Number(req.user.id), total, paymentMethod]
    );
    const orderId = orderResult.insertId;
    const reservationIds = [];
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      const price = Number(product.precio);
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, price]
      );
      if (item.date) {
        const [reservationResult] = await conn.query(
          `INSERT INTO reservations (order_id, user_id, product_id, reservation_date, quantity, price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, Number(req.user.id), item.productId, item.date, item.quantity, price]
        );
        reservationIds.push(reservationResult.insertId);
      }
    }
    await conn.commit();
    return res.status(201).json({
      message: 'Pedido creado',
      order_id: orderId,
      reservation_ids: reservationIds,
      total,
      status: 'pending'
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('Error creando pedido:', err.message);
    return res.status(500).json({ error: 'No se pudo crear el pedido' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT id, total, payment_method, order_status, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [Number(req.user.id)]
    );
    res.json(orders.map(order => ({ ...order, total: Number(order.total) })));
  } catch (err) {
    console.error('Error listando pedidos:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los pedidos' });
  }
});

function productoParams(req) {
  const { nombre, categoria, precio, descripcion, imagen, requiere_fecha, activo } = req.body;
  return {
    nombre: String(nombre || '').trim(),
    categoria: String(categoria || '').trim(),
    precio: Number(precio),
    descripcion: descripcion ? String(descripcion) : '',
    imagen: imagen ? String(imagen) : null,
    requiere_fecha: requiere_fecha ? 1 : 0,
    activo: activo === undefined ? 1 : (activo ? 1 : 0)
  };
}

// Categorías públicas (para el catálogo y formularios) con caché corta
app.get('/api/categories', async (req, res) => {
  try {
    const data = await getCached('categories', async () =>
      prisma.categories.findMany({
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true, descripcion: true, icono: true, color: true }
      })
    );
    res.json(data);
  } catch (err) {
    console.error('Error listando categorías:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las categorías' });
  }
});

// Catálogo público (productos activos) con paginación y caché corta
app.get('/api/products', async (req, res) => {
  const { page, limit, offset } = paginar(req.query, 200);
  try {
    const data = await getCached(`products:${page}:${limit}`, async () => {
      const [total, rows] = await Promise.all([
        prisma.products.count({ where: { activo: true } }),
        prisma.products.findMany({
          where: { activo: true },
          orderBy: [{ categoria: 'asc' }, { id: 'asc' }],
          skip: offset,
          take: limit,
          select: {
            id: true, nombre: true, categoria: true, precio: true,
            descripcion: true, imagen: true, requiere_fecha: true
          }
        })
      ]);
      return respuestaPaginada(rows.map(r => ({
        ...r,
        precio: Number(r.precio),
        requiere_fecha: !!r.requiere_fecha
      })), total, page, limit);
    });
    res.json(data);
  } catch (err) {
    console.error('Error listando productos:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
});

// ---- Rutas de administración ----

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [[{ total: usuarios }]] = await conn.query('SELECT COUNT(*) AS total FROM users');
      const [[{ total: productos }]] = await conn.query('SELECT COUNT(*) AS total FROM products');
      const [[{ total: categorias }]] = await conn.query('SELECT COUNT(*) AS total FROM categories');
      res.json({ usuarios, productos, categorias });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error en stats:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas' });
  }
});

app.get('/api/admin/categories', requireAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(`
        SELECT c.id, c.nombre, c.descripcion, c.icono, c.color, c.created_at,
               (SELECT COUNT(*) FROM products WHERE categoria = c.nombre) AS productos
        FROM categories c ORDER BY c.nombre
      `);
      res.json(rows);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error listando categorías admin:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las categorías' });
  }
});

app.post('/api/admin/categories', requireAdmin, validate(categorySchema), async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const icono = String(req.body.icono || 'fa-tag').trim() || 'fa-tag';
  const color = String(req.body.color || 'brand').trim() || 'brand';
  const coloresValidos = ['warn', 'danger', 'info', 'success', 'brand', 'muted'];
  if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
  if (!coloresValidos.includes(color)) return res.status(400).json({ error: 'Color inválido' });
  try {
    const conn = await pool.getConnection();
    try {
      const [exists] = await conn.query('SELECT id FROM categories WHERE nombre = ?', [nombre]);
      if (exists.length) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
const [result] = await conn.query(
        'INSERT INTO categories (nombre, descripcion, icono, color) VALUES (?, ?, ?, ?)',
        [nombre, descripcion || null, icono, color]
      );
      invalidarCatalogo();
      res.json({ message: 'Categoría creada', id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error creando categoría:', err.message);
    res.status(500).json({ error: 'No se pudo crear la categoría' });
  }
});

app.put('/api/admin/categories/:id', requireAdmin, validate(categorySchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  const nombre = String(req.body.nombre || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const icono = String(req.body.icono || 'fa-tag').trim() || 'fa-tag';
  const color = String(req.body.color || 'brand').trim() || 'brand';
  const coloresValidos = ['warn', 'danger', 'info', 'success', 'brand', 'muted'];
  if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
  if (!coloresValidos.includes(color)) return res.status(400).json({ error: 'Color inválido' });
  try {
    const conn = await pool.getConnection();
    try {
      const [oldRows] = await conn.query('SELECT nombre FROM categories WHERE id = ?', [id]);
      if (!oldRows.length) return res.status(404).json({ error: 'Categoría no encontrada' });
      const nombreAnterior = oldRows[0].nombre;
      const [dup] = await conn.query('SELECT id FROM categories WHERE nombre = ? AND id != ?', [nombre, id]);
      if (dup.length) return res.status(409).json({ error: 'Ya existe otra categoría con ese nombre' });
      await conn.query('UPDATE categories SET nombre = ?, descripcion = ?, icono = ?, color = ? WHERE id = ?', [nombre, descripcion || null, icono, color, id]);
if (nombre !== nombreAnterior) {
        await conn.query('UPDATE products SET categoria = ? WHERE categoria = ?', [nombre, nombreAnterior]);
      }
      invalidarCatalogo();
      res.json({ message: 'Categoría actualizada' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error actualizando categoría:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la categoría' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT nombre FROM categories WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Categoría no encontrada' });
      const [prods] = await conn.query('SELECT COUNT(*) AS c FROM products WHERE categoria = ?', [rows[0].nombre]);
      if (prods[0].c > 0) return res.status(409).json({ error: `No se puede eliminar: tiene ${prods[0].c} producto(s) asociado(s). Cambia o elimina esos productos primero.` });
await conn.query('DELETE FROM categories WHERE id = ?', [id]);
      invalidarCatalogo();
      res.json({ message: 'Categoría eliminada' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error eliminando categoría:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la categoría' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const { page, limit, offset } = paginar(req.query, 15);
  try {
    const conn = await pool.getConnection();
    try {
      const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM users');
      const [rows] = await conn.query(
        'SELECT id, username, email, role, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
      res.json(respuestaPaginada(rows, total, page, limit));
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error listando usuarios:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los usuarios' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT role FROM users WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (rows[0].role === 'admin') return res.status(403).json({ error: 'No se puede eliminar una cuenta admin' });
      if (req.user.id && id === Number(req.user.id)) return res.status(403).json({ error: 'No puedes eliminar tu propia cuenta' });
      await conn.query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ message: 'Usuario eliminado' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error eliminando usuario:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  const { role } = req.body;
  if (role !== 'user' && role !== 'admin') {
    return res.status(400).json({ error: 'Rol inválido. Usa "user" o "admin"' });
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT role FROM users WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (req.user.id && id === Number(req.user.id)) {
        return res.status(403).json({ error: 'No puedes cambiar tu propio rol' });
      }
      if (rows[0].role === 'admin' && role === 'user') {
        const [[{ total: admins }]] = await conn.query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
        if (admins <= 1) return res.status(409).json({ error: 'No se puede quitar el único administrador' });
      }
      await conn.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      res.json({ message: 'Rol actualizado', role });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error actualizando rol:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el rol' });
  }
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const { page, limit, offset } = paginar(req.query, 15);
  try {
    const conn = await pool.getConnection();
    try {
      const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM products');
      const [rows] = await conn.query(
        'SELECT * FROM products ORDER BY categoria, id LIMIT ? OFFSET ?',
        [limit, offset]
      );
      res.json(respuestaPaginada(
        rows.map(r => ({ ...r, precio: Number(r.precio), requiere_fecha: !!r.requiere_fecha, activo: !!r.activo })),
        total, page, limit
      ));
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error listando productos admin:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
});

// Subida de imagen de producto (multer + sharp -> WebP optimizado)
app.post('/api/admin/products/:id/image', requireAdmin, uploadImagen.single('imagen'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen' });
  if (!(req.file.mimetype || '').startsWith('image/')) {
    return res.status(400).json({ error: 'El archivo debe ser una imagen' });
  }
  try {
    // Verificar que el producto exista (sin retener la conexión durante el procesamiento)
    const conn = await pool.getConnection();
    let existe = false;
    try {
      const [rows] = await conn.query('SELECT id FROM products WHERE id = ?', [id]);
      existe = rows.length > 0;
    } finally {
      conn.release();
    }
    if (!existe) return res.status(404).json({ error: 'Producto no encontrado' });

    const filename = `${id}.webp`;
    await sharp(req.file.buffer)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(PRODUCT_IMG_DIR, filename));

    const conn2 = await pool.getConnection();
    try {
      await conn2.query('UPDATE products SET imagen = ? WHERE id = ?', [`/img/products/${filename}`, id]);
    } finally {
      conn2.release();
    }

    invalidarCatalogo();
    res.json({ message: 'Imagen actualizada', imagen: `/img/products/${filename}` });
  } catch (err) {
    console.error('Error procesando imagen:', err.message);
    res.status(500).json({ error: 'No se pudo procesar la imagen' });
  }
});

app.post('/api/admin/products', requireAdmin, validate(productSchema), async (req, res) => {
  const p = productoParams(req);
  if (!p.nombre || !p.categoria || !Number.isFinite(p.precio) || p.precio < 0) {
    return res.status(400).json({ error: 'Nombre, categoría y precio válido son requeridos' });
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [catExists] = await conn.query('SELECT id FROM categories WHERE nombre = ?', [p.categoria]);
      if (!catExists.length) return res.status(400).json({ error: 'La categoría no existe' });
const [result] = await conn.query(
        'INSERT INTO products (nombre, categoria, category_id, precio, descripcion, imagen, requiere_fecha, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [p.nombre, p.categoria, catExists[0].id, p.precio, p.descripcion, p.imagen, p.requiere_fecha, p.activo]
      );
      invalidarCatalogo();
      res.json({ message: 'Producto creado', id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error creando producto:', err.message);
    res.status(500).json({ error: 'No se pudo crear el producto' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, validate(productSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  const p = productoParams(req);
  if (!p.nombre || !p.categoria || !Number.isFinite(p.precio) || p.precio < 0) {
    return res.status(400).json({ error: 'Nombre, categoría y precio válido son requeridos' });
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [catExists] = await conn.query('SELECT id FROM categories WHERE nombre = ?', [p.categoria]);
      if (!catExists.length) return res.status(400).json({ error: 'La categoría no existe' });
      const [result] = await conn.query(
        'UPDATE products SET nombre = ?, categoria = ?, category_id = ?, precio = ?, descripcion = ?, imagen = ?, requiere_fecha = ?, activo = ? WHERE id = ?',
        [p.nombre, p.categoria, catExists[0].id, p.precio, p.descripcion, p.imagen, p.requiere_fecha, p.activo, id]
      );
if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
      invalidarCatalogo();
      res.json({ message: 'Producto actualizado' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error actualizando producto:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el producto' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.json({ error: 'ID inválido' });
  try {
    const conn = await pool.getConnection();
    try {
const [result] = await conn.query('DELETE FROM products WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
      invalidarCatalogo();
      res.json({ message: 'Producto eliminado' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error eliminando producto:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el producto' });
  }
});

app.post('/api/register', registerLimiter, validate(registerSchema), async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const conn = await pool.getConnection();
    try {
      // Verificar si el usuario o email ya existen
      const [rows] = await conn.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (rows.length > 0) {
        const existing = rows[0];
        // No sabemos si choca por username o por email, pero mantenemos mensajes similares
        return res.status(409).json({ error: 'El nombre de usuario o email ya está registrado' });
      }

      const hash = bcrypt.hashSync(password, 10);

      // Crear nuevo usuario
      const [insertResult] = await conn.query(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        [username, email, hash, 'user']
      );

      res.json(tokenResponse({ id: insertResult.insertId, username, role: 'user' }));
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('MySQL no disponible, usando users.json:', err.message);
    const result = registerWithJson(username, email, password);
    if (result.error) return res.status(409).json(result);
    res.json(result);
  }
});

app.post('/api/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const conn = await pool.getConnection();
    try {
      // Buscar usuario por username o email
      const [rows] = await conn.query(
        'SELECT id, username, email, password, role FROM users WHERE (username = ? OR email = ?) LIMIT 1',
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const user = rows[0];

      // Verificar contraseña (hash o texto plano legacy)
      const ok = esHashBcrypt(user.password)
        ? bcrypt.compareSync(password, user.password)
        : user.password === password;
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      // Migrar a hash si venía en texto plano
      if (!esHashBcrypt(user.password)) {
        await conn.query('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(user.password, 10), user.id]);
      }

      res.json(tokenResponse(user));
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('MySQL no disponible, usando users.json:', err.message);
    const result = loginWithJson(identifier, password);
    if (result.error) return res.status(401).json(result);
    res.json(result);
  }
});

app.listen(Number(process.env.PORT || 5000), () => {
  console.log(`Servidor corriendo en http://localhost:${process.env.PORT || 5000} (env: ${NODE_ENV})`);
});

