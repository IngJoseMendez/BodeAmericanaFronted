export const PACA_TIPOS = ['premium', 'jeans', 'mixta', 'playera', 'formal', 'deportiva', 'americana'];
export const PACA_CATEGORIAS = ['hombre', 'mujer', 'niño', 'unisex'];
// 'reservada' faltaba, y la pone el propio sistema: el botón "Reservar para
// cliente" de Inventario hace UPDATE pacas SET estado = 'reservada' (ver
// routes/reservas.js). Sin ella aquí, el desplegable de Estado no podía
// filtrarlas y esas pacas no había forma de encontrarlas desde la pantalla que
// las crea. Badge ya tenía su color, señal de que el estado llevaba tiempo vivo
// en producción y lo único que faltaba era esta lista.
export const PACA_ESTADOS = ['disponible', 'reservada', 'separada', 'vendida', 'despachada'];

export const CLIENTE_TIPOS = ['mayorista', 'minorista'];
export const CLIENTE_CLASIFICACION_PAGO = ['contado', 'credito'];
export const CLIENTE_ESTADOS = ['activo', 'inactivo'];

export const PAGO_TIPOS = ['contado', 'credito'];
export const PAGO_METODOS = ['efectivo', 'transferencia', 'cheque', 'otro'];

export const METODOS_PAGO = ['efectivo', 'transferencia', 'cheque', 'mercadopago', 'otro'];