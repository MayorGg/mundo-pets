// Middleware de validación genérico con Zod.
// Uso: app.post('/api/login', validate(loginSchema), handler)
const { z } = require('zod');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      return res.status(400).json({
        error: first ? first.message : 'Datos inválidos',
        details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
      });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };