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

// ── COMO ENTRO LA PLATA ─────────────────────────────────────────────────────
//
// Las cuatro formas en que de verdad entra un abono en esta casa. La lista
// anterior ('efectivo', 'transferencia', 'cheque', 'mercadopago', 'otro') era
// genérica y no describía nada de aquí: no se reciben cheques ni pagos por
// Mercado Pago, y faltaban las dos que más se usan, la consignación y el giro.
//
// Esto es una lista FIJA y no un catálogo de la base, a diferencia de la
// entidad y de la cuenta, porque es un tipo y no algo que crezca: si algún día
// apareciera una quinta forma de recibir plata, eso es una decisión de negocio
// que se piensa, no un nombre que se teclea en una pantalla.
//
// El valor va en minúsculas y sin tildes porque es lo que se guarda en la base
// (y porque el único abono que ya tenía método guardado dice 'efectivo', así
// que la convención ya estaba puesta). La etiqueta es lo que se lee.
export const TRANSACCIONES = [
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'consignacion',  label: 'Consignación' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'giro',          label: 'Giro' },
];

export const etiquetaTransaccion = (valor) =>
  TRANSACCIONES.find((t) => t.value === valor)?.label || valor || '';

// El efectivo es el único que no va a ninguna parte: es plata que entró en la
// casa, sin entidad y sin cuenta. Los otros tres sí tienen destino. Se pregunta
// con una función para que la pantalla y el servidor no puedan discrepar.
export const transaccionTieneDestino = (valor) =>
  Boolean(valor) && valor !== 'efectivo';