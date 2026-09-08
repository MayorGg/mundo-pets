const request = require('supertest');
const app = require('../server');

describe('Roles y protección de rutas', () => {
  it('sin token responde 401', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('refresh token usado como bearer responde 401', async () => {
    const login = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${login.body.refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('usuario normal a ruta admin responde 403', async () => {
    const login = await request(app).post('/api/login').send({ identifier: 'demo', password: 'demo123' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it('admin accede a stats con 200', async () => {
    const login = await request(app).post('/api/login').send({ identifier: 'admin', password: '123456' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.productos).toBeGreaterThan(0);
    expect(res.body.categorias).toBeGreaterThan(0);
  });
});