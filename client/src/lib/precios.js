// ── DE DÓNDE SALE EL PRECIO DE UNA PACA ────────────────────────────────────
//
// EL MODELO, que hay que entender antes de tocar nada.
//
// La dueña fija los precios por CATEGORÍA + CALIDAD, y «categoría» aquí es la
// TEMPORADA: sólo hay dos, invierno y verano. La tabla `precios_preestablecidos`
// tiene exactamente eso —15 filas, «verano / premium → 2.300.000»— y es lo que
// se edita en la pantalla de Precios.
//
// Lo que se escoge en la Matriz, en una cotización o en el inventario no es una
// temporada: es una REFERENCIA («deportivo», «mixta verano», «polar»). Las
// referencias viven en `paca_categorias` —nombre heredado y confuso: guarda
// REFERENCIAS, no categorías— y cada una cuelga de una temporada por
// `temporada_id`. `deportivo` es de verano, `polar` es de invierno.
//
// Así que el precio de «deportivo premium» NO se busca por «deportivo»: se
// busca por la temporada de deportivo, que es verano. Ese salto
// referencia → temporada → precio es el que esta función hace en un solo sitio.
//
// POR QUÉ ESTÁ AQUÍ Y NO EN CADA PANTALLA.
// Estaba escrito tres veces —Matriz, Cotizaciones y el modal de aprobar un
// contenedor— y las tres copias se separaron: dos ponían el precio guardado en
// la paca por encima del de la tabla de Precios y la tercera no. El mismo
// producto salía a un precio distinto según la pantalla desde la que se mirara.
// Una regla de precios repetida acaba dando precios distintos; es sólo cuestión
// de tiempo.
//
// EL ORDEN, Y UN CAMBIO DELIBERADO RESPECTO A LO QUE HABÍA.
//
//   1. PROMOCIÓN vigente para esa referencia + calidad (+ clasificación si la
//      promo la especifica). Es una decisión con fecha de inicio y de fin: gana
//      sobre todo lo demás porque alguien la escribió para hoy.
//   2. CATÁLOGO: el precio de la tabla de Precios para la temporada de esa
//      referencia + la calidad. Es el precio que la dueña fija y mantiene.
//   3. INVENTARIO: el precio guardado en las pacas de esa referencia + calidad,
//      que es el que se tecleó al aprobar su contenedor.
//
// Antes el 3 iba ANTES del 2, con este razonamiento escrito en Cotizaciones:
// «es el que la gente ve en el contenedor y el que espera encontrar aquí, así
// que manda sobre el preestablecido genérico». Se invierte a propósito: el
// precio del contenedor es una foto del día en que se aprobó ese contenedor, y
// el de la tabla de Precios es la decisión vigente. Cuando los dos existen y no
// coinciden, manda la decisión, no la foto.
//
// Hoy esos dos difieren en 48 de los 125 grupos de producto con stock, y casi
// siempre porque el precio guardado es MÁS ALTO: «verano / especial» está a
// 1.430.000 en la tabla y a 1.600.000 en las pacas. Por eso la función devuelve
// las DOS cifras y un `discrepancia`: la pantalla aplica la que manda y enseña
// la otra al lado. Cambiar un precio en silencio es lo único que no se puede
// hacer aquí.
//
// LO QUE NO HACE: inventar. Sin promoción, sin fila en el catálogo y sin precio
// en el inventario devuelve `precio: null` y un aviso con el motivo. Un 0 en un
// campo de precio es una cotización gratis.

export const ORIGEN_PROMOCION = 'promocion';
export const ORIGEN_CATALOGO = 'catalogo';
export const ORIGEN_INVENTARIO = 'inventario';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase();

// Los importes llegan del driver de Postgres como cadena ('1700000.00').
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * La temporada —la «categoría» de la tabla de Precios— a la que pertenece una
 * referencia. Null cuando la referencia no está en el catálogo: hay 49 grupos
 * de pacas con referencias que nadie dio de alta (ABRIGO, SHORT MIXTO...), y
 * para ésas no hay precio de catálogo que buscar.
 */
export function temporadaDeReferencia(referencia, referencias) {
  const n = norm(referencia);
  if (!n) return null;
  const fila = (Array.isArray(referencias) ? referencias : []).find((r) => norm(r?.nombre) === n);
  return fila?.temporada_nombre || fila?.temporada || null;
}

/**
 * El precio de venta de una referencia + calidad, con el orden de arriba.
 *
 * @param {object} que  { referencia, calidad, clasificacion }
 * @param {object} tablas { promos, preestablecidos, listaPrecios, referencias }
 * @returns {{
 *   precio: number|null, origen: string|null, categoria: string|null,
 *   precioCatalogo: number|null, precioInventario: number|null,
 *   discrepancia: boolean, esPromocion: boolean, aviso: string|null
 * }}
 */
export function precioDeVenta({ referencia, calidad, clasificacion } = {}, tablas = {}) {
  // `lista()` y no un valor por defecto: el defecto sólo entra con `undefined`,
  // y estas tablas llegan en `null` de verdad mientras una carga va en vuelo
  // (`Promise.allSettled` que falló, o el primer render antes del fetch). Con
  // `= []` a secas, un `null` pasaba derecho y reventaba en el `.find`.
  const lista = (v) => (Array.isArray(v) ? v : []);
  const promos = lista(tablas?.promos);
  const preestablecidos = lista(tablas?.preestablecidos);
  const listaPrecios = lista(tablas?.listaPrecios);
  const referencias = lista(tablas?.referencias);
  const nRef = norm(referencia);
  const nCal = norm(calidad);

  const vacio = {
    precio: null, origen: null, categoria: null,
    precioCatalogo: null, precioInventario: null,
    discrepancia: false, esPromocion: false, aviso: null,
  };
  if (!nRef || !nCal) return vacio;

  const categoria = temporadaDeReferencia(referencia, referencias);

  // Las dos cifras que pueden competir, resueltas siempre: hacen falta las dos
  // para poder enseñar la que no se aplicó.
  const filaCatalogo = categoria
    ? preestablecidos.find((p) => norm(p.categoria) === norm(categoria) && norm(p.calidad) === nCal)
    : null;
  const precioCatalogo = num(filaCatalogo?.precio) || null;

  const filaInventario = listaPrecios.find(
    (l) => norm(l.referencia) === nRef && norm(l.calidad) === nCal
  );
  const precioInventario = num(filaInventario?.precio) || null;

  const discrepancia = !!(precioCatalogo && precioInventario
    && Math.round(precioCatalogo) !== Math.round(precioInventario));

  const base = { categoria, precioCatalogo, precioInventario, discrepancia };

  // 1 · PROMOCIÓN. Una promo con clasificación concreta gana a una general, y
  // entre iguales la más alta: quien escribió dos para el mismo producto no
  // dejó dicho cuál, y la más baja regalaría margen sin que nadie lo decidiera.
  const promo = (promos || [])
    .filter((p) => norm(p.referencia) === nRef && norm(p.calidad) === nCal
      && (clasificacion
        ? (!p.clasificacion || norm(p.clasificacion) === norm(clasificacion))
        : !p.clasificacion)
      && num(p.precio_promocional) > 0)
    .sort((a, b) => {
      const especificidad = (a.clasificacion ? 0 : 1) - (b.clasificacion ? 0 : 1);
      if (especificidad !== 0) return especificidad;
      return num(b.precio_promocional) - num(a.precio_promocional);
    })[0];
  if (promo) {
    return { ...base, precio: num(promo.precio_promocional), origen: ORIGEN_PROMOCION,
      esPromocion: true, aviso: null };
  }

  // 2 · CATÁLOGO: la decisión vigente de la dueña.
  if (precioCatalogo) {
    return { ...base, precio: precioCatalogo, origen: ORIGEN_CATALOGO, esPromocion: false,
      aviso: discrepancia
        ? `Precio de catálogo (${categoria} / ${calidad}). Las pacas de ${referencia}`
          + ' tienen guardado otro precio; manda el de la tabla de Precios.'
        : null };
  }

  // 3 · INVENTARIO: lo que se tecleó al aprobar el contenedor. Sólo cuando el
  // catálogo no tiene fila para esa temporada + calidad.
  if (precioInventario) {
    return { ...base, precio: precioInventario, origen: ORIGEN_INVENTARIO, esPromocion: false,
      aviso: categoria
        ? `Sin precio en la tabla de Precios para ${categoria} / ${calidad}:`
          + ' se usa el que tienen guardadas las pacas.'
        : `«${referencia}» no está en el catálogo de referencias, así que no tiene temporada`
          + ' con la que buscar su precio: se usa el que tienen guardadas las pacas.' };
  }

  // Nada. Se dice el motivo, que no es el mismo en los dos casos.
  return { ...base, precio: null, origen: null, esPromocion: false,
    aviso: categoria
      ? `Sin precio para ${referencia} / ${calidad} (temporada ${categoria}).`
        + ' Escríbelo a mano o añádelo en Precios.'
      : `«${referencia}» no está en el catálogo de referencias y no tiene temporada asignada,`
        + ' así que no hay precio que buscar. Dala de alta en Catálogo o escribe el precio a mano.' };
}
