// Las cuentas de una cotización.
//
// Viven aquí, y no dentro de la pantalla, por dos razones: para que la
// separación masiva y la cotización normal no puedan sacar números distintos
// del mismo caso, y para poder probarlas sin navegador. Son funciones puras:
// entran datos, sale un número.
//
// Regla del negocio: el descuento se topa POR ÍTEM. Ningún ítem descuenta más
// de lo que vale ni le "presta" descuento a otro. Antes convivían dos fórmulas
// —una para la fila que se mostraba y otra para el total— y el total cobraba
// menos de lo que sumaban las filas.

import { parseMonto } from './money.js';

/** Cantidad de un ítem, siempre entera y nunca negativa. */
export const cantidadDe = (item) => Math.max(0, Math.round(parseMonto(item?.cantidad)));

/** Precio unitario de un ítem, leído en formato colombiano. */
export const precioDe = (item) => parseMonto(item?.precio);

/** Un ítem sólo cuenta si de verdad se puede cotizar. */
export const itemCompleto = (it) =>
  Boolean(it?.referencia) && Boolean(it?.calidad) && cantidadDe(it) > 0 && precioDe(it) > 0;

/**
 * Precio final de UNA unidad después del descuento.
 * Se redondea a peso: no existen fracciones de peso colombiano, y redondear
 * aquí —y no al final— es lo que hace que la fila y el total cuadren siempre.
 */
export const precioConDescuento = (precio, descuentoRaw, tipoDescuento) => {
  const base = Number(precio) || 0;
  const raw = Number(descuentoRaw) || 0;
  if (raw <= 0) return base;
  if (tipoDescuento === 'porcentaje') return Math.max(0, Math.round(base * (1 - raw / 100)));
  return Math.max(0, Math.round(base - raw));
};

/**
 * La tasa del dólar de UN cliente, o null si factura sólo en pesos.
 *
 * ESTA FUNCIÓN ES LA QUE DECIDE LA MONEDA DEL DOCUMENTO, y por eso vive aquí
 * con el resto de las reglas de plata y no dentro de una pantalla.
 *
 * Hay clientes que compran en pesos y clientes que compran en pesos y dólares.
 * Lo único que los distingue es si su casilla de tasa está escrita, así que el
 * VACÍO ES UNA RESPUESTA y no un olvido: devuelve null, el servidor lo guarda
 * como NULL y el PDF sale sin columna de dólares.
 *
 * Y devuelve null —no 1, y no 0— con todo lo que no sea una tasa de verdad. Un
 * 1 aquí significaba «un peso vale un dólar»: la cotización se guardaba con
 * tasa 1 y el PDF sacaba «Subtotal USD» con la misma cifra que la de pesos. Las
 * cinco cotizaciones que había en producción estaban así.
 *
 * El corte en «mayor que 1» es EL MISMO que el del servidor (`tasaOnada`, en
 * routes/cotizaciones.js). A propósito: si la pantalla aceptara una tasa que el
 * servidor descarta, el total que ella ve y el que se guarda saldrían de dos
 * monedas distintas.
 */
export const tasaDeFila = (fila) => {
  const n = parseMonto(fila?.tasa);
  return Number.isFinite(n) && n > 1 ? n : null;
};

/**
 * Todo lo que hay que enseñar (y enviar) de un cliente, calculado en un solo
 * sitio: subtotal, unidades, descuento, transporte y total.
 *
 * @param fila  { items, descuento, tipo_descuento, transporte_unitario }
 */
export function totalesFila(fila) {
  const validos = (fila?.items || []).filter(itemCompleto);
  const subtotal = validos.reduce((s, i) => s + cantidadDe(i) * precioDe(i), 0);
  const unidades = validos.reduce((s, i) => s + cantidadDe(i), 0);

  const descRaw = parseMonto(fila?.descuento);
  // Las pacas con precio de promoción no reciben descuento encima: la promoción
  // YA es el precio rebajado, y descontar dos veces regalaría mercancía.
  const descuento = validos
    .filter((i) => !i.esPromocion)
    .reduce(
      (s, i) => s + (precioDe(i) - precioConDescuento(precioDe(i), descRaw, fila?.tipo_descuento)) * cantidadDe(i),
      0
    );

  // EL TRANSPORTE ES EL DE LA FILA, Y YA NO HAY GLOBAL AL QUE CAER.
  //
  // Había uno en la barra de la Matriz y esta función resolvía la herencia: una
  // celda vacía tomaba el de arriba y un 0 escrito a mano valía 0 ("este
  // cliente recoge en bodega"). La dueña bajó el flete —y la tasa— a cada
  // cliente, así que no queda nada que heredar: vacío es sin transporte, que es
  // lo mismo que el 0 que antes había que escribir para decirlo.
  const transporteUnitario = parseMonto(fila?.transporte_unitario);
  const transporteTotal = transporteUnitario * unidades;

  return {
    validos, subtotal, unidades, descuento, transporteUnitario, transporteTotal,
    total: subtotal - descuento + transporteTotal,
  };
}
