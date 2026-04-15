import { z } from 'zod';

export const clienteSchema = z.object({
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .trim(),
  
  telefono: z
    .string()
    .min(10, 'El teléfono debe tener al menos 10 dígitos')
    .max(20, 'El teléfono no puede exceder 20 caracteres')
    .regex(/^[\d\s\-\+\(\)]+$/, 'Formato de teléfono inválido'),
  
  email: z
    .string()
    .email('Correo electrónico inválido')
    .optional()
    .or(z.literal('')),
  
  direccion: z
    .string()
    .max(200, 'La dirección no puede exceder 200 caracteres')
    .optional()
    .trim(),
  
  limiteCredito: z
    .number()
    .min(0, 'El límite de crédito no puede ser negativo')
    .max(1000000, 'El límite de crédito es muy alto')
    .optional(),
  
  rfc: z
    .string()
    .length(13, 'El RFC debe tener 13 caracteres')
    .regex(/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/, 'Formato de RFC inválido')
    .optional()
    .or(z.literal('')),
});

export const pacaSchema = z.object({
  numero_lote: z
    .string()
    .min(1, 'El número de lote es requerido')
    .max(50, 'El número de lote es muy largo'),
  
  tipo_id: z
    .number()
    .int('Debe ser un número entero')
    .positive('Debe seleccionar un tipo de paca'),
  
  cantidad: z
    .number()
    .int('Debe ser un número entero')
    .min(1, 'La cantidad debe ser al menos 1'),
  
  peso: z
    .number()
    .min(0.1, 'El peso debe ser mayor a 0')
    .max(10000, 'El peso máximo es 10,000 kg'),
  
  costo: z
    .number()
    .min(0, 'El costo no puede ser negativo')
    .max(1000000, 'El costo máximo es $1,000,000'),
  
  precioVenta: z
    .number()
    .min(0, 'El precio de venta no puede ser negativo')
    .max(1000000, 'El precio máximo es $1,000,000'),
  
  estado: z
    .enum(['disponible', 'separada', 'vendida'], {
      errorMap: () => ({ message: 'Seleccione un estado válido' }),
    }),
});

export const ventaSchema = z.object({
  cliente_id: z
    .number()
    .int('Debe seleccionar un cliente')
    .positive('Debe seleccionar un cliente'),
  
  paca_ids: z
    .array(z.number().int().positive())
    .min(1, 'Debe seleccionar al menos una paca'),
  
  fecha_entrega: z
    .string()
    .optional(),
  
  observaciones: z
    .string()
    .max(500, 'Las observaciones no pueden exceder 500 caracteres')
    .optional()
    .trim(),
  
  descuento: z
    .number()
    .min(0, 'El descuento no puede ser negativo')
    .max(100, 'El descuento no puede exceder 100%')
    .optional()
    .default(0),
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Correo electrónico inválido'),
  
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'La contraseña es muy larga'),
});

export const pagoSchema = z.object({
  cliente_id: z
    .number()
    .int('Debe seleccionar un cliente')
    .positive('Debe seleccionar un cliente'),
  
  monto: z
    .number()
    .min(1, 'El monto debe ser mayor a 0')
    .max(1000000, 'El monto máximo es $1,000,000'),
  
  fecha: z
    .string()
    .min(1, 'La fecha es requerida'),
  
  metodo_pago: z
    .enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'], {
      errorMap: () => ({ message: 'Seleccione un método de pago válido' }),
    }),
  
  referencia: z
    .string()
    .max(100, 'La referencia no puede exceder 100 caracteres')
    .optional()
    .trim(),
});

export type ClienteFormData = z.infer<typeof clienteSchema>;
export type PacaFormData = z.infer<typeof pacaSchema>;
export type VentaFormData = z.infer<typeof ventaSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type PagoFormData = z.infer<typeof pagoSchema>;
