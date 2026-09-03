const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Mismos 16 productos del catálogo original (frontend/script.js)
const PRODUCTOS = [
  { id: 1, nombre: "Croquetas Premium", categoria: "Alimentos", precio: 45000, descripcion: "Alimento balanceado para perros adultos", requiere_fecha: 0 },
  { id: 2, nombre: "Comida Húmeda Gatos", categoria: "Alimentos", precio: 15000, descripcion: "Pate de salmón para gatos", requiere_fecha: 0 },
  { id: 3, nombre: "Snacks Caninos", categoria: "Alimentos", precio: 8000, descripcion: "Galletas de entrenamiento", requiere_fecha: 0 },
  { id: 4, nombre: "Vitaminas Mascotas", categoria: "Alimentos", precio: 25000, descripcion: "Suplemento vitamínico completo", requiere_fecha: 0 },
  { id: 5, nombre: "Antiparasitario", categoria: "Medicamentos", precio: 35000, descripcion: "Desparasitante interno y externo", requiere_fecha: 0 },
  { id: 6, nombre: "Antiinflamatorio", categoria: "Medicamentos", precio: 28000, descripcion: "Para dolores articulares", requiere_fecha: 0 },
  { id: 7, nombre: "Antibiótico", categoria: "Medicamentos", precio: 42000, descripcion: "Tratamiento infecciones", requiere_fecha: 0 },
  { id: 8, nombre: "Vacuna Triple", categoria: "Medicamentos", precio: 55000, descripcion: "Vacuna polivalente", requiere_fecha: 0 },
  { id: 9, nombre: "Baño y Corte", categoria: "Peluquería", precio: 35000, descripcion: "Servicio completo de peluquería", requiere_fecha: 1 },
  { id: 10, nombre: "Corte de Uñas", categoria: "Peluquería", precio: 15000, descripcion: "Corte y limpieza de uñas", requiere_fecha: 1 },
  { id: 11, nombre: "Limpieza de Oídos", categoria: "Peluquería", precio: 12000, descripcion: "Limpieza profunda de oídos", requiere_fecha: 1 },
  { id: 12, nombre: "Tratamiento Capilar", categoria: "Peluquería", precio: 45000, descripcion: "Hidratación y brillo", requiere_fecha: 1 },
  { id: 13, nombre: "Guardería Día", categoria: "Guardería", precio: 25000, descripcion: "Cuidado por día completo", requiere_fecha: 1 },
  { id: 14, nombre: "Guardería Noche", categoria: "Guardería", precio: 35000, descripcion: "Cuidado nocturno", requiere_fecha: 1 },
  { id: 15, nombre: "Paseo Grupal", categoria: "Guardería", precio: 15000, descripcion: "Paseo de 1 hora en grupo", requiere_fecha: 1 },
  { id: 16, nombre: "Entrenamiento", categoria: "Guardería", precio: 50000, descripcion: "Sesión de entrenamiento básico", requiere_fecha: 1 }
];

const ADMIN = { username: 'admin', email: 'admin@test.com', password: '123456' };
const DEMO = { username: 'demo', email: 'demo@mundo-pets.com', password: 'demo123' };

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].c > 0;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  await conn.query(`
    CREATE DATABASE IF NOT EXISTS mundo_pets
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci
  `);
  await conn.query('USE mundo_pets');

  // Migración: role y created_at en users
  if (!(await columnExists(conn, 'users', 'role'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`);
    console.log('Columna users.role creada.');
  }
  if (!(await columnExists(conn, 'users', 'created_at'))) {
    await conn.query(`ALTER TABLE users ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    console.log('Columna users.created_at creada.');
  }

  // Tabla products
  await conn.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      categoria VARCHAR(50) NOT NULL,
      precio DECIMAL(10,2) NOT NULL,
      descripcion TEXT NULL,
      imagen VARCHAR(255) NULL,
      requiere_fecha TINYINT(1) NOT NULL DEFAULT 0,
      activo TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('Tabla products lista.');

  // Índices para catálogo (consulta por activo y agrupación por categoria)
  if (!(await indexExists(conn, 'products', 'idx_products_activo'))) {
    await conn.query('CREATE INDEX idx_products_activo ON products (activo)');
    console.log('Índice idx_products_activo creado.');
  }
  if (!(await indexExists(conn, 'products', 'idx_products_categoria'))) {
    await conn.query('CREATE INDEX idx_products_categoria ON products (categoria)');
    console.log('Índice idx_products_categoria creado.');
  }

  // Tabla categories + seed
  await conn.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL UNIQUE,
      descripcion TEXT NULL,
      icono VARCHAR(50) NOT NULL DEFAULT 'fa-tag',
      color VARCHAR(20) NOT NULL DEFAULT 'brand',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('Tabla categories lista.');

  const CATEGORIAS = [
    { nombre: 'Alimentos', descripcion: 'Nutrición y comida para tus mascotas', icono: 'fa-bone', color: 'warn' },
    { nombre: 'Medicamentos', descripcion: 'Cuidado médico y salud', icono: 'fa-pills', color: 'danger' },
    { nombre: 'Peluquería', descripcion: 'Belleza y aseo', icono: 'fa-cut', color: 'info' },
    { nombre: 'Guardería', descripcion: 'Cuidado y servicio diario', icono: 'fa-home', color: 'success' }
  ];

  for (const c of CATEGORIAS) {
    await conn.query(
      `INSERT INTO categories (nombre, descripcion, icono, color)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), icono = VALUES(icono), color = VALUES(color)`,
      [c.nombre, c.descripcion, c.icono, c.color]
    );
  }
  console.log(`Seed de ${CATEGORIAS.length} categorías aplicado.`);

  // Seed de productos (idempotente)
  for (const p of PRODUCTOS) {
    await conn.query(
      `INSERT INTO products (id, nombre, categoria, precio, descripcion, requiere_fecha)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         categoria = VALUES(categoria),
         precio = VALUES(precio),
         descripcion = VALUES(descripcion),
         requiere_fecha = VALUES(requiere_fecha)`,
      [p.id, p.nombre, p.categoria, p.precio, p.descripcion, p.requiere_fecha]
    );
  }
  console.log(`Seed de ${PRODUCTOS.length} productos aplicado.`);

  // Cuenta admin
  const [adminRow] = await conn.query('SELECT id FROM users WHERE email = ? OR username = ?', [ADMIN.email, ADMIN.username]);
  if (adminRow.length === 0) {
    await conn.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)', [ADMIN.username, ADMIN.email, bcrypt.hashSync(ADMIN.password, 10), 'admin']);
    console.log('Cuenta admin creada.');
  } else {
    await conn.query('UPDATE users SET role = ?, password = ? WHERE id = ?', ['admin', bcrypt.hashSync(ADMIN.password, 10), adminRow[0].id]);
    console.log('Cuenta admin actualizada.');
  }

  // Usuario demo (usuario normal)
  const [demoRow] = await conn.query('SELECT id FROM users WHERE email = ? OR username = ?', [DEMO.email, DEMO.username]);
  if (demoRow.length === 0) {
    await conn.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)', [DEMO.username, DEMO.email, bcrypt.hashSync(DEMO.password, 10), 'user']);
    console.log('Usuario demo creado.');
  } else {
    await conn.query('UPDATE users SET role = ? WHERE id = ?', ['user', demoRow[0].id]);
  }

  await conn.end();

  console.log('\n--- Credenciales ---');
  console.log(`Admin:   ${ADMIN.username} / ${ADMIN.password}  (${ADMIN.email})`);
  console.log(`Usuario: ${DEMO.username} / ${DEMO.password}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});