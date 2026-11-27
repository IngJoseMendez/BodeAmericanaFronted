// ── QUÉ SE PUEDE BUSCAR DE UNA PROMOCIÓN ────────────────────────────────────
//
// Vive en lib y no dentro de PreciosPromocion.jsx por el motivo de siempre en
// este repo: las pruebas son `node` pelado y no saben leer un `.jsx`, así que
// una regla metida en la pantalla es una regla que nadie puede comprobar. Y
// esta merece comprobarse, porque decidir qué entra y qué no en el texto
// buscable es lo que separa una búsqueda que sirve de una que miente.
import { coincideBusqueda } from './matriz.js';

/**
 * El texto buscable de una promoción: EXACTAMENTE lo que se lee en su fila.
 *
 * Referencia, calidad y clasificación. Cuando no hay clasificación la tabla
 * pinta «Todas», así que esa palabra entra también: lo que se busca es lo que
 * está escrito, sin reglas de más que luego nadie recuerda.
 *
 * LO QUE NO ENTRA, Y POR QUÉ. Las tres son tentadoras y las tres estropean la
 * búsqueda:
 *
 *   · EL ESTADO (Activa / Inactiva). Parece gratis y es una trampa: «inactiva»
 *     CONTIENE «activa», así que buscar las activas devolvería también las
 *     apagadas. Filtrar por vigencia son dos botones, no un campo de texto.
 *   · LA CATEGORÍA (temporada) de la referencia. Se podría sacar del catálogo,
 *     pero no está escrita en la fila: buscar «invierno» devolvería filas donde
 *     esa palabra no aparece por ningún lado, y una búsqueda que la pantalla no
 *     puede explicar se lee como un fallo.
 *   · LOS PRECIOS Y LAS FECHAS. Un «1» suelto coincidiría con casi todo.
 */
export const textoDeFila = (promo) => [
  promo?.referencia,
  promo?.calidad,
  promo?.clasificacion || 'Todas',
].join(' ');

/**
 * Las promociones que coinciden con lo que se está buscando.
 *
 * El comparador es `coincideBusqueda`, el MISMO con el que se busca un cliente
 * en la Matriz y una familia en Repartido, y se reutiliza en vez de escribir
 * aquí un cuarto: exige que TODAS las palabras aparezcan, PERO EN CUALQUIER
 * ORDEN y sin tener que estar seguidas, ignorando mayúsculas y tildes.
 *
 * Eso es lo que hace que funcione de verdad con estos nombres, que son largos y
 * compuestos: «invierno mixta» encuentra «mixta invierno plus size», y «mixta
 * premium» encuentra la referencia por un lado y la calidad por el otro. Un
 * `includes` de la frase entera —que es lo primero que uno escribe— exigiría
 * las palabras pegadas y en ese mismo orden, y entonces «premium mixta» no
 * encontraría nada.
 *
 * EL ORDEN NO SE TOCA: llega del servidor y es el que ella ya conoce. Filtrar
 * no es reordenar. Y una consulta vacía devuelve la lista entera, que es lo que
 * hace que quitar la búsqueda no necesite ningún caso especial.
 */
export const filtrarPromociones = (promos, consulta) =>
  (Array.isArray(promos) ? promos : []).filter((p) => coincideBusqueda(textoDeFila(p), consulta));
