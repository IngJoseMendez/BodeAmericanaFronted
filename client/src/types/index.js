export const PACA_TIPOS = ['premium', 'jeans', 'mixta', 'playera', 'formal', 'deportiva', 'americana'];
export const PACA_CATEGORIAS = ['hombre', 'mujer', 'niño', 'unisex'];
// 'reservada' faltaba, y la pone el propio sistema: el botón "Reservar para
// cliente" de Inventario hace UPDATE pacas SET estado = 'reservada' (ver
// routes/reservas.js). Sin ella aquí, el desplegable de Estado no podía
// filtrarlas y esas pacas no había forma de encontrarlas desde la pantalla que
// las crea. Badge ya tenía su color, señal de que el estado llevaba tiempo vivo
// en producción y lo único que faltaba era esta lista.
export const PACA_ESTADOS = ['disponible', 'reservada', 'separada', 'vendida', 'despachada'];

// ── QUÉ CLASE DE CLIENTE ES ───────────────────────────────────────
//
// Esto era `['mayorista', 'minorista']` y nadie lo enseñaba: el formulario de
// clientes guardaba `tipo_cliente: 'mayorista'` fijo, sin casilla para
// elegirlo. De ahí que los 98 clientes de la base sean mayoristas, que no es
// una decisión de nadie sino la falta de un campo.
//
// LOS VALORES GUARDADOS NO SE RENOMBRAN. 'mayorista' y 'minorista' ya están en
// la base; cambiarlos por 'al_por_mayor' y 'detal' obligaría a una migración
// que toque los 98 para que sigan diciendo lo mismo. Lo que cambia es el
// rótulo, que es lo que se lee.
export const CLIENTE_TIPOS = [
  { value: 'mayorista', label: 'Al por mayor' },
  { value: 'minorista', label: 'Al detal' },
  { value: 'distribuidora', label: 'Distribuidora' },
];

/**
 * El rótulo de un tipo de cliente.
 * Devuelve el valor tal cual si no lo conoce: un tipo viejo o escrito a mano se
 * enseña como está, no se esconde ni se cambia por «mayorista» por defecto.
 */
export const etiquetaTipoCliente = (valor) =>
  CLIENTE_TIPOS.find((t) => t.value === valor)?.label || valor || '';
export const CLIENTE_CLASIFICACION_PAGO = ['contado', 'credito'];
export const CLIENTE_ESTADOS = ['activo', 'inactivo'];

export const PAGO_TIPOS = ['contado', 'credito'];
export const PAGO_METODOS = ['efectivo', 'transferencia', 'cheque', 'otro'];

export const METODOS_PAGO = ['efectivo', 'transferencia', 'cheque', 'mercadopago', 'otro'];