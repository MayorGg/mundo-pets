const request = require('supertest');
const app = require('../server');
const prisma = require('../lib/prisma');
const { uid } = require('./helpers');

describe('Autenticación', () => {
  const creados = [];

  it('registra un usuario válido y devuelve tokens', async () => {
    const username = uid('test_user');
    const res = await request(app)
      .post('/api/register')
      .send({ username, email: `${username}@test.com`, password: 'clave123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.role).toBe('user');
    creados.push(username);
  });

  it('rechaza email inválido con 400', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: uid('mail'), email: 'no-email', password: 'clave123' });
    expect(res.status).toBe(400);
  });

  it('rechaza contraseña corta con 400', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: uid('corto'), email: `${uid('corto')}@test.com`, password: '123' });
    expect(res.status).toBe(400);
  });

  it('rechaza duplicado con 409', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'admin', email: 'admin@test.com', password: '123456' });
    expect(res.status).toBe(409);
  });

  it('login correcto devuelve tokens y rol admin', async () => {
    const res = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.role).toBe('admin');
  });

  it('login con contraseña incorrecta responde 401', async () => {
    const res = await request(app).post('/api/login').send({ identifier: 'admin', password: 'mala' });
    expect(res.status).toBe(401);
  });

  it('refresh sin token responde 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('refresh con token inválido responde 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'basura' });
    expect(res.status).toBe(401);
  });

  afterAll(async () => {
    if (creados.length) {
      await prisma.users.deleteMany({ where: { username: { in: creados } } });
    }
    await prisma.$disconnect();
  });
});