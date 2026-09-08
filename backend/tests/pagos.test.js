const request = require('supertest');
const app = require('../server');
const prisma = require('../lib/prisma');
const { uid, futureWeekday } = require('./helpers');

describe('Pagos y disponibilidad por cupo', () => {
  let adminToken;
  let userToken;
  let testProductId;
  let fecha;
  const creados = [];

  beforeAll(async () => {
    const admin = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    adminToken = admin.body.token;
    const user = await request(app).post('/api/login').send({ identifier: 'demo', password: 'demo123' });
    userToken = user.body.token;
    fecha = futureWeekday(6);

    // Producto de prueba con agenda y cupo 1
    const p = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: uid('test_cupo'), categoria: 'Guardería', precio: 1000, requiere_fecha: true, cupo_diario: 1 });
    testProductId = p.body.id;
  });

  it('crea una reserva cuando hay cupo (201)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ id: testProductId, quantity: 1, date: fecha }], payment_method: 'pse' });
    expect(res.status).toBe(201);
    creados.push(res.body.order_id);
  });

  it('rechaza la segunda reserva del mismo día sin cupo (409)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ id: testProductId, quantity: 1, date: fecha }], payment_method: 'pse' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Sin cupo');
  });

  it('crea intención de pago y el webhook marca el pedido como pagado', async () => {
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ id: 1, quantity: 1 }], payment_method: 'pse' });
    expect(order.status).toBe(201);
    creados.push(order.body.order_id);

    const pay = await request(app)
      .post(`/api/orders/${order.body.order_id}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ provider: 'pse' });
    expect(pay.status).toBe(201);
    expect(pay.body.payment_id).toBeDefined();

    const web = await request(app)
      .post('/api/payments/webhook')
      .send({ payment_id: pay.body.payment_id, status: 'paid' });
    expect(web.status).toBe(200);

    const updated = await prisma.orders.findUnique({ where: { id: order.body.order_id } });
    expect(updated.order_status).toBe('paid');
  });

  it('rechaza pagar un pedido ajeno (403)', async () => {
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ id: 1, quantity: 1 }], payment_method: 'pse' });
    expect(order.status).toBe(201);
    creados.push(order.body.order_id);

    const adminUser = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    const pay = await request(app)
      .post(`/api/orders/${order.body.order_id}/pay`)
      .set('Authorization', `Bearer ${adminUser.body.token}`)
      .send({ provider: 'pse' });
    expect(pay.status).toBe(403);
  });

  afterAll(async () => {
    if (creados.length) {
      await prisma.orders.deleteMany({ where: { id: { in: creados } } });
    }
    if (testProductId) {
      await prisma.products.delete({ where: { id: testProductId } });
    }
    await prisma.$disconnect();
  });
});