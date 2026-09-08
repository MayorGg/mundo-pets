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

  // Tabla users (el seed es autocontenido: la crea si no existe)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

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
      category_id INT NULL,
      precio DECIMAL(10,2) NOT NULL,
      descripcion TEXT NULL,
      imagen VARCHAR(255) NULL,
      requiere_fecha TINYINT(1) NOT NULL DEFAULT 0,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      cupo_diario INT NOT NULL DEFAULT 5,
      INDEX idx_products_activo (activo),
      INDEX idx_products_categoria (categoria),
      INDEX idx_products_category_id (category_id),
      CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('Tabla products lista.');

  // Migración: cupo_diario (disponibilidad por día para servicios con agenda)
  if (!(await columnExists(conn, 'products', 'cupo_diario'))) {
    await conn.query(`ALTER TABLE products ADD COLUMN cupo_diario INT NOT NULL DEFAULT 5 AFTER activo`);
    console.log('Columna products.cupo_diario creada.');
  }

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

  await conn.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      order_status ENUM('pending','paid','processing','cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_orders_user_id (user_id),
      INDEX idx_orders_status (order_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_order_items_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      reservation_date DATE NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      reservation_status ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reservations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reservations_product FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_reservations_user_id (user_id),
      INDEX idx_reservations_date (reservation_date),
      INDEX idx_reservations_status (reservation_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('Tablas orders, order_items y reservations listas.');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      provider VARCHAR(50) NOT NULL,
      external_ref VARCHAR(100) NOT NULL UNIQUE,
      amount DECIMAL(10,2) NOT NULL,
      status ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      INDEX idx_payments_order_id (order_id),
      INDEX idx_payments_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('Tabla payments lista.');

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

  // Seed de productos (idempotente), con category_id vía FK real
  const [catRows] = await conn.query('SELECT id, nombre FROM categories');
  const catIdByNombre = new Map(catRows.map(c => [c.nombre, c.id]));
  for (const p of PRODUCTOS) {
    const categoryId = catIdByNombre.get(p.categoria) || null;
    await conn.query(
      `INSERT INTO products (id, nombre, categoria, category_id, precio, descripcion, requiere_fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         categoria = VALUES(categoria),
         category_id = VALUES(category_id),
         precio = VALUES(precio),
         descripcion = VALUES(descripcion),
         requiere_fecha = VALUES(requiere_fecha)`,
      [p.id, p.nombre, p.categoria, categoryId, p.precio, p.descripcion, p.requiere_fecha]
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