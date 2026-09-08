const request = require('supertest');
const app = require('../server');
const prisma = require('../lib/prisma');
const { uid } = require('./helpers');

describe('Productos (admin)', () => {
  let token;
  const creados = [];

  beforeAll(async () => {
    const login = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    token = login.body.token;
  });

  it('crea producto y puebla category_id', async () => {
    const nombre = uid('test_prod');
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre, categoria: 'Alimentos', precio: 12345 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    const p = await prisma.products.findUnique({
      where: { id: res.body.id },
      include: { categories: true }
    });
    expect(p.categories.nombre).toBe('Alimentos');
    creados.push(res.body.id);
  });

  it('rechaza precio negativo con 400', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: uid('neg'), categoria: 'Alimentos', precio: -5 });
    expect(res.status).toBe(400);
  });

  it('rechaza categoría inexistente con 400', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: uid('cat'), categoria: 'CategoriaQueNoExiste', precio: 100 });
    expect(res.status).toBe(400);
  });

  it('actualizar producto inexistente responde 404', async () => {
    const res = await request(app)
      .put('/api/admin/products/999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'x', categoria: 'Alimentos', precio: 1 });
    expect(res.status).toBe(404);
  });

  it('elimina un producto', async () => {
    const nombre = uid('test_del');
    const c = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre, categoria: 'Guardería', precio: 5000 });
    const res = await request(app)
      .delete(`/api/admin/products/${c.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    if (creados.length) {
      await prisma.products.deleteMany({ where: { id: { in: creados } } });
    }
    await prisma.$disconnect();
  });
});