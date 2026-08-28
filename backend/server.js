
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Servir el frontend (páginas HTML, CSS, JS)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Servir imágenes (fondo Mundo Pet, etc.)
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

const SECRET = 'clave_secreta';
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function registerWithJson(username, email, password) {
  const users = loadUsers();
  if (users.some(u => u.username === username || u.email === email)) {
    return { error: 'El nombre de usuario o email ya está registrado' };
  }
  users.push({ username, email, password, role: 'user' });
  saveUsers(users);
  const token = jwt.sign({ username, role: 'user' }, SECRET);
  return { token, username, role: 'user', message: 'Usuario registrado exitosamente' };
}

function loginWithJson(identifier, password) {
  const users = loadUsers();
  const user = users.find(
    u => (u.username === identifier || u.email === identifier) && u.password === password
  );
  if (!user) return { error: 'Credenciales inválidas' };
  const role = user.role || 'user';
  const token = jwt.sign({ username: user.username, role }, SECRET);
  return { token, username: user.username, role, message: 'Inicio de sesión exitoso' };
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
    req.user = jwt.verify(token, SECRET);
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

// Categorías públicas (para el catálogo y formularios)
app.get('/api/categories', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT id, nombre, descripcion, icono, color FROM categories ORDER BY nombre');
      res.json(rows);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error listando categorías:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las categorías' });
  }
});

// Catálogo público (productos activos)
app.get('/api/products', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, nombre, categoria, precio, descripcion, imagen, requiere_fecha FROM products WHERE activo = 1 ORDER BY categoria, id'
      );
      res.json(rows.map(r => ({
        ...r,
        precio: Number(r.precio),
        requiere_fecha: !!r.requiere_fecha
      })));
    } finally {
      conn.release();
    }
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

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
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
      if (exists.length) return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
      const [result] = await conn.query(
        'INSERT INTO categories (nombre, descripcion, icono, color) VALUES (?, ?, ?, ?)',
        [nombre, descripcion || null, icono, color]
      );
      res.json({ message: 'Categoría creada', id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error creando categoría:', err.message);
    res.status(500).json({ error: 'No se pudo crear la categoría' });
  }
});

app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
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
      if (!oldRows.length) return res.json({ error: 'Categoría no encontrada' });
      const nombreAnterior = oldRows[0].nombre;
      const [dup] = await conn.query('SELECT id FROM categories WHERE nombre = ? AND id != ?', [nombre, id]);
      if (dup.length) return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });
      await conn.query('UPDATE categories SET nombre = ?, descripcion = ?, icono = ?, color = ? WHERE id = ?', [nombre, descripcion || null, icono, color, id]);
      if (nombre !== nombreAnterior) {
        await conn.query('UPDATE products SET categoria = ? WHERE categoria = ?', [nombre, nombreAnterior]);
      }
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
      if (!rows.length) return res.json({ error: 'Categoría no encontrada' });
      const [prods] = await conn.query('SELECT COUNT(*) AS c FROM products WHERE categoria = ?', [rows[0].nombre]);
      if (prods[0].c > 0) return res.json({ error: `No se puede eliminar: tiene ${prods[0].c} producto(s) asociado(s). Cambia o elimina esos productos primero.` });
      await conn.query('DELETE FROM categories WHERE id = ?', [id]);
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
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, username, email, role, created_at FROM users ORDER BY id DESC'
      );
      res.json(rows);
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
      if (rows.length === 0) return res.json({ error: 'Usuario no encontrado' });
      if (rows[0].role === 'admin') return res.json({ error: 'No se puede eliminar una cuenta admin' });
      if (req.user.id && id === Number(req.user.id)) return res.json({ error: 'No puedes eliminar tu propia cuenta' });
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
      if (rows.length === 0) return res.json({ error: 'Usuario no encontrado' });
      if (req.user.id && id === Number(req.user.id)) {
        return res.json({ error: 'No puedes cambiar tu propio rol' });
      }
      if (rows[0].role === 'admin' && role === 'user') {
        const [[{ total: admins }]] = await conn.query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
        if (admins <= 1) return res.json({ error: 'No se puede quitar el único administrador' });
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
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT * FROM products ORDER BY categoria, id');
      res.json(rows.map(r => ({ ...r, precio: Number(r.precio), requiere_fecha: !!r.requiere_fecha, activo: !!r.activo })));
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error listando productos admin:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
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
        'INSERT INTO products (nombre, categoria, precio, descripcion, imagen, requiere_fecha, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.nombre, p.categoria, p.precio, p.descripcion, p.imagen, p.requiere_fecha, p.activo]
      );
      res.json({ message: 'Producto creado', id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error creando producto:', err.message);
    res.status(500).json({ error: 'No se pudo crear el producto' });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
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
        'UPDATE products SET nombre = ?, categoria = ?, precio = ?, descripcion = ?, imagen = ?, requiere_fecha = ?, activo = ? WHERE id = ?',
        [p.nombre, p.categoria, p.precio, p.descripcion, p.imagen, p.requiere_fecha, p.activo, id]
      );
      if (result.affectedRows === 0) return res.json({ error: 'Producto no encontrado' });
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
      if (result.affectedRows === 0) return res.json({ error: 'Producto no encontrado' });
      res.json({ message: 'Producto eliminado' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error eliminando producto:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el producto' });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  // Validaciones
  if (!username || !email || !password) {
    return res.json({ error: 'Todos los campos son requeridos' });
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.json({ error: 'Formato de email inválido' });
  }

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
        return res.json({ error: 'El nombre de usuario o email ya está registrado' });
      }

      // Crear nuevo usuario
      const [insertResult] = await conn.query(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        [username, email, password, 'user']
      );

      const token = jwt.sign({ id: insertResult.insertId, username, role: 'user' }, SECRET);
      res.json({ token, username, role: 'user', message: 'Usuario registrado exitosamente' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('MySQL no disponible, usando users.json:', err.message);
    const result = registerWithJson(username, email, password);
    if (result.error) return res.json(result);
    res.json(result);
  }
});

app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  
  if (!identifier || !password) {
    return res.json({ error: 'Usuario/Email y contraseña son requeridos' });
  }

  try {
    const conn = await pool.getConnection();
    try {
      // Buscar usuario por username o email
      const [rows] = await conn.query(
        'SELECT id, username, email, password, role FROM users WHERE (username = ? OR email = ?) AND password = ? LIMIT 1',
        [identifier, identifier, password]
      );

      if (rows.length === 0) {
        return res.json({ error: 'Credenciales inválidas' });
      }

      const user = rows[0];
      const role = user.role || 'user';
      const token = jwt.sign({ id: user.id, username: user.username, role }, SECRET);
      res.json({ token, username: user.username, role, message: 'Inicio de sesión exitoso' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('MySQL no disponible, usando users.json:', err.message);
    const result = loginWithJson(identifier, password);
    if (result.error) return res.json(result);
    res.json(result);
  }
});

app.listen(5000, () => {
  console.log('Servidor corriendo en http://localhost:5000');
});
