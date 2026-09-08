const request = require('supertest');
const app = require('../server');
const prisma = require('../lib/prisma');
const { futureWeekday, futureSunday } = require('./helpers');

describe('Pedidos (checkout y reglas de fecha)', () => {
  let token;
  const creados = [];

  beforeAll(async () => {
    const login = await request(app).post('/api/login').send({ identifier: 'demo', password: 'demo123' });
    token = login.body.token;
  });

  it('rechaza pedido vacío con 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [], payment_method: 'pse' });
    expect(res.status).toBe(400);
  });

  it('rechaza método de pago inválido con 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: 1, quantity: 1 }], payment_method: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  it('rechaza fecha de reserva en domingo con 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: 9, quantity: 1, date: futureSunday() }], payment_method: 'pse' });
    expect(res.status).toBe(400);
  });

  it('rechaza fecha pasada con 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: 9, quantity: 1, date: '2020-01-01' }], payment_method: 'pse' });
    expect(res.status).toBe(400);
  });

  it('crea pedido recalculando precios desde el servidor (201)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: 1, quantity: 2 }], payment_method: 'pse' });
    expect(res.status).toBe(201);
    // Croquetas Premium cuesta 45000 en BD; el servidor recalcula, nunca confía en el cliente
    expect(Number(res.body.total)).toBe(90000);
    creados.push(res.body.order_id);
  });

  it('crea pedido con reserva para un servicio con fecha válida', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: 9, quantity: 1, date: futureWeekday(4) }], payment_method: 'efectivo' });
    expect(res.status).toBe(201);
    expect(res.body.reservation_ids.length).toBe(1);
    creados.push(res.body.order_id);
  });

  it('acepta el formato legacy reservation_date (compatibilidad con el frontend)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ product_id: 9, quantity: 1, reservation_date: futureWeekday(7) }], payment_method: 'efectivo' });
    expect(res.status).toBe(201);
    expect(res.body.reservation_ids.length).toBe(1);
    creados.push(res.body.order_id);
  });

  afterAll(async () => {
    if (creados.length) {
      // El borrado en cascada elimina order_items y reservations
      await prisma.orders.deleteMany({ where: { id: { in: creados } } });
    }
    await prisma.$disconnect();
  });
});