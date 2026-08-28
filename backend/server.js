
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
  users.push({ username, email, password });
  saveUsers(users);
  const token = jwt.sign({ username }, SECRET);
  return { token, username, message: 'Usuario registrado exitosamente' };
}

function loginWithJson(identifier, password) {
  const users = loadUsers();
  const user = users.find(
    u => (u.username === identifier || u.email === identifier) && u.password === password
  );
  if (!user) return { error: 'Credenciales inválidas' };
  const token = jwt.sign({ username: user.username }, SECRET);
  return { token, username: user.username, message: 'Inicio de sesión exitoso' };
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
      await conn.query(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, password]
      );

      const token = jwt.sign({ username }, SECRET);
      res.json({ token, username, message: 'Usuario registrado exitosamente' });
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
        'SELECT id, username, email, password FROM users WHERE (username = ? OR email = ?) AND password = ? LIMIT 1',
        [identifier, identifier, password]
      );

      if (rows.length === 0) {
        return res.json({ error: 'Credenciales inválidas' });
      }

      const user = rows[0];
      const token = jwt.sign({ username: user.username }, SECRET);
      res.json({ token, username: user.username, message: 'Inicio de sesión exitoso' });
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
