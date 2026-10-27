// ── LO DISPONIBLE, AGRUPADO POR PRODUCTO ──────────────────────────
//
// La bodega no piensa en pacas sueltas, piensa en productos: «mándame tres
// mixtas de verano calidad A». Una pantalla que ofrece doscientas seis casillas
// numeradas, una por paca, obliga a hacer a mano la cuenta que el sistema ya
// sabe hacer, y encima deja elegir tres pacas del mismo producto marcando tres
// casillas distintas que después hay que repasar una por una.
//
// Aquí se agrupa por REFERENCIA + CALIDAD, que es el par con el que trabajan el
// inventario, la matriz, las promociones y el despacho directo. Vive aparte
// porque lo usan dos pantallas —Ventas y Despachos— y son justo las dos que
// mueven mercancía: si cada una agrupara a su manera, una ofrecería existencias
// que la otra no ve.
//
// NINGUNA DE ESTAS FUNCIONES INVENTA UN PRECIO. Cuando un grupo mezcla precios
// se devuelve `null` y se marca `mezclado`, para que la pantalla deje la casilla
// EN BLANCO en vez de proponer uno de los dos como si fuera el bueno.

import { promoDeLinea } from './entregables.js';

const txt = (v) => String(v ?? '').trim();

/** La clave con la que se cruza un producto: referencia + calidad, sin mayúsculas. */
export const claveStock = (referencia, calidad) =>
  `${txt(referencia).toLowerCase()}|${txt(calidad).toLowerCase()}`;

/** Orden de bodega: alfabético por referencia y, dentro, por calidad. */
export const ordenProducto = (a, b) =>
  txt(a.referencia).localeCompare(txt(b.referencia), 'es', { sensitivity: 'base' })
  || txt(a.calidad).localeCompare(txt(b.calidad), 'es', { sensitivity: 'base' });

/**
 * Lo disponible según `GET /pacas/inventario`, agrupado y con el precio de hoy.
 *
 * EL ENDPOINT AGRUPA TAMBIÉN POR CONTENEDOR Y PROVEEDOR, así que una misma
 * referencia llega repartida en varias filas y hay que sumarla: sin esto la
 * pantalla ofrece menos de lo que de verdad hay en la bodega.
 *
 * El precio es el de HOY —la promoción si la hay, y si no el de lista—, que es
 * como lo resuelven Cotizaciones y los Excel. Si dentro del grupo no todas las
 * filas valen lo mismo, el precio sale `null` y `mezclado` queda en true.
 *
 * @returns {{referencia, calidad, disponibles, precio: number|null, mezclado: boolean}[]}
 */
export function agruparStock(filas) {
  const m = new Map();
  for (const f of filas || []) {
    const disp = parseInt(f?.disponibles, 10) || 0;
    if (disp <= 0) continue;
    const referencia = txt(f.referencia);
    if (!referencia) continue;
    const calidad = txt(f.calidad);

    const promo = promoDeLinea(f);
    const lista = parseFloat(f.precio_unitario);
    const precio = promo != null ? promo : (Number.isFinite(lista) ? lista : null);

    const k = claveStock(referencia, calidad);
    const ya = m.get(k);
    if (!ya) {
      m.set(k, { referencia, calidad, disponibles: disp, precio, mezclado: false });
      continue;
    }
    ya.disponibles += disp;
    // Dos filas del mismo producto con precios distintos: no se escoge una.
    if (precio != null && ya.precio != null && precio !== ya.precio) {
      ya.mezclado = true;
      ya.precio = null;
    } else if (ya.precio == null && !ya.mezclado) {
      ya.precio = precio;
    }
  }
  return [...m.values()].sort(ordenProducto);
}

/**
 * Las pacas disponibles de `GET /pacas`, agrupadas y CON SUS IDENTIFICADORES.
 *
 * Hace falta la lista de ids porque la venta se registra contra pacas
 * concretas: la pantalla deja pedir «3 de este producto» y de aquí salen las
 * tres primeras. Se toman por orden de id, el mismo criterio que usa el
 * servidor al despachar (`ORDER BY id`), para que lo que se vende sea lo que
 * llegó antes y no una paca al azar.
 *
 * `preciosHoy` es opcional: un Map de `claveStock` → precio ya resuelto con
 * promoción, tal como lo devuelve `agruparStock`. Cuando se pasa, manda él,
 * porque la promoción no viaja en la fila de la paca y sin esto se cobraría el
 * precio de lista de algo que está rebajado. Si no se pasa, el precio sale del
 * que lleven escrito las pacas, y sólo si todas coinciden.
 *
 * @returns {{referencia, calidad, disponibles, ids: number[],
 *            precio: number|null, mezclado: boolean}[]}
 */
export function agruparPacas(pacas, preciosHoy) {
  const m = new Map();
  for (const p of pacas || []) {
    const referencia = txt(p?.referencia);
    if (!referencia) continue;
    const calidad = txt(p.calidad);
    const k = claveStock(referencia, calidad);

    const suyo = parseFloat(p.precio_venta);
    const precioPaca = Number.isFinite(suyo) && suyo > 0 ? suyo : null;

    let g = m.get(k);
    if (!g) {
      g = {
        referencia, calidad, disponibles: 0, ids: [],
        clasificacion: txt(p.clasificacion), categoria: txt(p.categoria),
        precio: null, mezclado: false,
      };
      m.set(k, g);
    }
    g.disponibles++;
    g.ids.push(Number(p.id));
    if (precioPaca != null) {
      if (g.precio == null && !g.mezclado) g.precio = precioPaca;
      else if (g.precio != null && g.precio !== precioPaca) { g.mezclado = true; g.precio = null; }
    }
  }

  for (const g of m.values()) {
    g.ids.sort((a, b) => a - b);
    const hoy = preciosHoy?.get(claveStock(g.referencia, g.calidad));
    // El precio de hoy GANA, incluso sobre un grupo que ya coincidía: si hay
    // promoción corriendo, el precio escrito en la paca es el viejo.
    if (hoy != null) g.precio = hoy;
  }

  return [...m.values()].sort(ordenProducto);
}

/** Map de clave → precio de hoy, para pasárselo a `agruparPacas`. */
export function preciosDeHoy(filasInventario) {
  const m = new Map();
  for (const g of agruparStock(filasInventario)) {
    if (g.precio != null) m.set(claveStock(g.referencia, g.calidad), g.precio);
  }
  return m;
}
