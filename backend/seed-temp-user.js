const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const TEMP_USER = {
  username: 'demo',
  email: 'demo@mundo-pets.com',
  password: 'demo123'
};

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
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    )
  `);

  const [existing] = await conn.query(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    [TEMP_USER.username, TEMP_USER.email]
  );

  if (existing.length === 0) {
    await conn.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [TEMP_USER.username, TEMP_USER.email, bcrypt.hashSync(TEMP_USER.password, 10)]
    );
    console.log('Usuario temporal creado.');
  } else {
    await conn.query(
      'UPDATE users SET password = ? WHERE username = ?',
      [bcrypt.hashSync(TEMP_USER.password, 10), TEMP_USER.username]
    );
    console.log('Usuario temporal ya existía; contraseña actualizada.');
  }

  await conn.end();
  console.log('\n--- Credenciales temporales ---');
  console.log('Usuario: demo');
  console.log('Contraseña: demo123');
  console.log('Email (también sirve para login): demo@mundo-pets.com');
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error('\nAsegúrate de que MySQL esté encendido (XAMPP/WAMP) y que root no tenga contraseña, o edita server.js con tus datos.');
  process.exit(1);
});
