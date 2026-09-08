const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const USERS_FILE = path.join(__dirname, 'users.json');
const esHash = p => typeof p === 'string' && p.startsWith('$2');

async function main() {
  // 1) MySQL
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mundo_pets'
  });
  const [rows] = await conn.query('SELECT id, username, password FROM users');
  let migradosDb = 0;
  for (const u of rows) {
    if (esHash(u.password)) continue;
    const hash = bcrypt.hashSync(u.password, 10);
    await conn.query('UPDATE users SET password = ? WHERE id = ?', [hash, u.id]);
    migradosDb++;
  }
  await conn.end();
  console.log(`MySQL: ${migradosDb} contraseñas migradas a hash.`);

  // 2) users.json (fallback)
  if (fs.existsSync(USERS_FILE)) {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    let migradosJson = 0;
    for (const u of users) {
      if (esHash(u.password)) continue;
      u.password = bcrypt.hashSync(u.password, 10);
      migradosJson++;
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`users.json: ${migradosJson} contraseñas migradas a hash.`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});