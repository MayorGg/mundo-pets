// Esquemas de validación con Zod para los endpoints de Mundo Pets.
const { z } = require('zod');

const CATEGORY_COLORS = ['warn', 'danger', 'info', 'success', 'brand', 'muted'];

const loginSchema = z.object({
  identifier: z.string({ required_error: 'Ingresa tu usuario o correo' }).trim().min(1, 'Ingresa tu usuario o correo'),
  password: z.string({ required_error: 'Ingresa tu contraseña' }).min(1, 'Ingresa tu contraseña')
});

const registerSchema = z.object({
  username: z.string({ required_error: 'El usuario es requerido' }).trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(50),
  email: z.string({ required_error: 'El correo es requerido' }).trim().email('Formato de email inválido'),
  password: z.string({ required_error: 'La contraseña es requerida' }).min(6, 'La contraseña debe tener al menos 6 caracteres').max(72)
});

const refreshSchema = z.object({
  refreshToken: z.string({ required_error: 'Falta el refresh token' }).min(1, 'Falta el refresh token')
});

const productSchema = z.object({
  nombre: z.string({ required_error: 'El nombre es requerido' }).trim().min(1, 'El nombre es requerido').max(100),
  categoria: z.string({ required_error: 'La categoría es requerida' }).trim().min(1, 'La categoría es requerida').max(50),
  precio: z.number({ required_error: 'El precio es requerido', invalid_type_error: 'El precio debe ser numérico' }).nonnegative('El precio no puede ser negativo'),
  descripcion: z.string().max(1000).optional().default(''),
  imagen: z.string().nullable().optional(),
  requiere_fecha: z.boolean().optional(),
  activo: z.boolean().optional(),
  cupo_diario: z.number().int().min(1, 'El cupo diario debe ser al menos 1').max(999).optional().default(5)
});

const categorySchema = z.object({
  nombre: z.string({ required_error: 'El nombre de la categoría es requerido' }).trim().min(1, 'El nombre de la categoría es requerido').max(50),
  descripcion: z.string().max(500).optional().default(''),
  icono: z.string().min(1).max(50).optional().default('fa-tag'),
  color: z.enum(CATEGORY_COLORS, { errorMap: () => ({ message: 'Color inválido' }) }).default('brand')
});

const orderLineSchema = z.object({
  id: z.number().int().positive().optional(),
  product_id: z.number().int().positive().optional()
}).refine(data => data.id !== undefined || data.product_id !== undefined, {
  message: 'Cada línea debe tener un producto'
});

const orderSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    product_id: z.number().int().positive().optional(),
    quantity: z.number().int().min(1, 'Cantidad inválida').max(100, 'Cantidad máxima 100'),
    date: z.string().nullable().optional(),
    reservation_date: z.string().nullable().optional()
  }).refine(d => d.id !== undefined || d.product_id !== undefined, {
    message: 'Cada línea debe tener un producto'
  })).min(1, 'El pedido debe contener al menos un producto'),
  payment_method: z.string().trim().min(1, 'El método de pago es requerido')
});

module.exports = {
  loginSchema,
  registerSchema,
  refreshSchema,
  productSchema,
  categorySchema,
  orderSchema,
  CATEGORY_COLORS
};