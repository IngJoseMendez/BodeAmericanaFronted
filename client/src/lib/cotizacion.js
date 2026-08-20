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
 * Todo lo que hay que enseñar (y enviar) de un cliente, calculado en un solo
 * sitio: subtotal, unidades, descuento, transporte y total.
 *
 * @param fila              { items, descuento, tipo_descuento, transporte_unitario }
 * @param transporteGlobal  el valor de la barra superior, que la fila puede pisar
 */
export function totalesFila(fila, transporteGlobal) {
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

  // El transporte de la fila pisa al global sólo si la usuaria escribió algo:
  // un 0 escrito a propósito ("este cliente recoge en bodega") tiene que valer 0,
  // pero una celda vacía hereda el global.
  const propio = String(fila?.transporte_unitario ?? '').trim();
  const transporteUnitario = propio === '' ? (Number(transporteGlobal) || 0) : parseMonto(propio);
  const transporteTotal = transporteUnitario * unidades;

  return {
    validos, subtotal, unidades, descuento, transporteUnitario, transporteTotal,
    total: subtotal - descuento + transporteTotal,
  };
}
