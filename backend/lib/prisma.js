// Cliente Prisma de Mundo Pets (Prisma 7 + driver adapter MariaDB).
// Nota: server.js carga dotenv antes de requerir este módulo.
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mundo_pets'
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;