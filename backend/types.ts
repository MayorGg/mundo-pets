// Tipos compartidos de la API de Mundo Pets.
// Este módulo solo contiene tipos (no se ejecuta en runtime); se valida con `tsc --noEmit`.

export type Role = 'user' | 'admin';

export interface TokenPayload {
  id: number;
  username: string;
  role: Role;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  username: string;
  role: Role;
  message?: string;
}

export interface ProductInput {
  nombre: string;
  categoria: string;
  precio: number;
  descripcion?: string;
  imagen?: string | null;
  requiere_fecha?: boolean;
  activo?: boolean;
}

export interface CategoryInput {
  nombre: string;
  descripcion?: string;
  icono?: string;
  color: 'warn' | 'danger' | 'info' | 'success' | 'brand' | 'muted';
}

export interface OrderItemInput {
  productId: number;
  quantity: number;
  date?: string | null;
}

export interface CreateOrderInput {
  items: OrderItemInput[];
  payment_method: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PublicProduct {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  descripcion: string | null;
  imagen: string | null;
  requiere_fecha: boolean;
}

export interface PublicCategory {
  id: number;
  nombre: string;
  descripcion: string | null;
  icono: string;
  color: string;
}