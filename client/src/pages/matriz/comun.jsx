// ── Piezas que comparten el orquestador y las dos fases de la Matriz ─────────
//
// Este archivo nace al partir `SeparacionMasiva.jsx` en un orquestador y dos
// fases. Al partirlo aparecieron media docena de ayudantes que vivían a nivel
// de módulo y que ahora necesitan DOS o TRES archivos a la vez: `entregaDeCliente`
// la usa la fila de la Fase 1 para pintar a dónde se envía y el orquestador para
// armar el cuerpo del guardado; `itemVacio` la usan los manejadores del
// orquestador y el saneador del borrador; `campo` la usan los controles densos
// de las dos fases, que tienen que verse idénticos porque son la MISMA tabla con
// el agrupador girado.
//
// La alternativa era duplicarlos. Duplicar `entregaDeCliente` significa que
// algún día la línea bajo el nombre del cliente diga «se envía al destino
// registrado» y el cuerpo del POST mande la dirección del cliente, sin que falle
// absolutamente nada: la guía sale mal y se descubre cuando la mercancía llega a
// otra ciudad. Duplicar `campo` significa que la Fase 2 se vea medio píxel
// distinta de la Fase 1 y se pierda la mitad del aprendizaje gratis que da que
// las columnas se correspondan una a una.
//
// Todo lo de aquí es PURO y de módulo: ni estado, ni hooks, ni React. Eso es lo
// que permite que las props que bajan a `FilaCliente` (un React.memo del que
// depende que teclear no repinte cientos de filas) sigan teniendo identidad
// estable sin trucos.

import { cantidadDe, precioDe } from '../../lib/cotizacion';
import { formatCOP, formatNumero } from '../../lib/money';
import { formatFechaCorta } from '../../lib/fecha';

// Los importes que llegan del servidor ya vienen en formato máquina ("45000.00"):
// se leen con Number. parseMonto es SÓLO para lo que teclea la usuaria, donde el
// punto separa miles.
export const numServidor = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// La raya bajo la cabecera va como sombra interior y NO como border-b. La tabla
// colapsa bordes (lo hace el preflight de Tailwind), y un borde colapsado lo
// pinta la TABLA, no la celda: se queda clavado en su sitio cuando la cabecera
// se despega y el encabezado acaba flotando sin línea sobre las filas. La sombra
// pertenece a la celda y viaja con ella. Va en un objeto de módulo para que su
// identidad no cambie en cada render.
export const RAYA_CABECERA = { boxShadow: 'inset 0 -1px 0 var(--color-border)' };

/**
 * Altura fija y baja en todos los controles de las dos fases: es lo que permite
 * que quepan quince clientes en pantalla en vez de tres.
 *
 * La separación lateral NO va aquí a propósito. Si la base trajera px-2 y quien
 * llama pidiera px-1, ganaría px-2: en Tailwind el desempate lo decide el orden
 * de la hoja generada (px-1 se escribe antes que px-2), no el orden dentro del
 * atributo, así que la clase del que llama no haría nada. Cada campo pone la
 * suya y la columna estrecha de cantidad puede de verdad ser estrecha.
 */
export const campo = (mal, extra = '') =>
  `h-8 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50 ${
    mal ? 'border-error' : 'border-border'
  } ${extra}`;

// `cargado` es lo que se trajo del libro de faltantes a esta línea, y `origen`
// el precio al que se le debía. Los dos nacen en cero/null y sólo los escribe el
// botón «+ Lo que le faltó»: son lo que hace que cargar dos veces no duplique el
// pedido y que se pueda ofrecer «respetarle el precio viejo» sin ir a buscarlo
// otra vez al servidor.
export const itemVacio = () => ({
  referencia: '', calidad: '', cantidad: '1', precio: '', esPromocion: false, avisoPrecio: null,
  cargado: 0, precioOrigen: null, respetaOrigen: false, faltanteId: null,
});

/** Descuento pactado con el cliente, en pesos por paca, listo para el campo. */
export const descuentoPactado = (cliente) => {
  const n = Number(cliente?.descuento);
  return Number.isFinite(n) && n > 0 ? formatNumero(n, { maxDecimales: 2 }) : '';
};

// Al elegir cliente, Cotizaciones mete solo su descuento pactado (pesos por
// paca, valor fijo). Sin esto la vía masiva cobraba precio pleno a TODOS los
// clientes que tienen descuento negociado, en silencio y por cada cotización.
export const filaVacia = (cliente) => ({
  items: [itemVacio()],
  descuento: descuentoPactado(cliente),
  tipo_descuento: 'valor_fijo',
  transporte_unitario: '',
  tipo_transporte: '',
});

export const itemTieneAlgo = (it) => Boolean(it?.referencia || it?.calidad) || precioDe(it) > 0;

export const faltaEnItem = (it) => {
  const falta = [];
  if (!it?.referencia) falta.push('referencia');
  if (!it?.calidad) falta.push('calidad');
  if (cantidadDe(it) <= 0) falta.push('cantidad');
  if (precioDe(it) <= 0) falta.push('precio');
  return falta;
};

// ── A dónde se manda la mercancía de cada cliente ───────────────────────────
// El cliente puede tener guardado un destino habitual de envío (una bodega, una
// transportadora) distinto de sus propios datos. Aquí NO hay selector como en
// Cotizaciones: son decenas de clientes y preguntar por cada uno sería
// inmanejable, así que la regla es fija —si tiene destino registrado se usa
// ese, y si no, los datos del propio cliente— y la línea bajo el nombre dice
// cuál de los dos se va a usar.
// Basta con que UNO de los cuatro campos tenga algo para considerar que hay
// destino: exigirlos todos dejaría fuera a quien solo apuntó la transportadora
// y la ciudad.
export const entregaDeCliente = (cliente) => {
  const destino = {
    destinatario:      cliente?.destino_nombre?.trim()    || '',
    direccion_entrega: cliente?.destino_direccion?.trim() || '',
    ciudad_entrega:    cliente?.destino_ciudad?.trim()    || '',
    celular:           cliente?.destino_celular?.trim()   || '',
  };
  // Un destino a medias (por ejemplo, solo la ciudad) NO se completa con los
  // datos del cliente: mezclar dos direcciones en un mismo envío es peor que
  // uno incompleto. Pero entonces el despacho sale a medias, y aquí no hay
  // selector ni casillas que editar, así que la fila tiene que avisarlo antes
  // de guardar —si no, nadie se entera hasta que la guía sale en blanco—.
  if (Object.values(destino).some(Boolean)) {
    return { ...destino, fuente: 'destino', incompleto: Object.values(destino).some((v) => !v) };
  }
  return {
    destinatario:      cliente?.nombre?.trim()    || '',
    direccion_entrega: cliente?.direccion?.trim() || '',
    ciudad_entrega:    cliente?.ciudad?.trim()    || '',
    celular:           cliente?.telefono?.trim()  || '',
    fuente: 'cliente',
    incompleto: false,
  };
};

// ── El resumen de faltantes de UN cliente, precalculado como texto ───────────
//
// La regla de rendimiento del diseño es innegociable y es la razón de que esto
// sea una función de módulo y no algo que se calcule al pintar: dentro del
// objeto que llega a la fila NO puede haber ni un `Date`, ni un id aleatorio, ni
// un «hace N días» calculado en render. La Matriz pinta cientos de <tbody> y el
// React.memo de la fila compara props por identidad; un objeto nuevo por render
// —o un string de fecha que cambie al pasar la medianoche— tira la memoización
// sin que nada falle, y la pantalla se vuelve melaza al teclear.
//
// Por eso `corto` y `detalle` salen de aquí ya como cadenas, una sola vez, al
// cargar los faltantes.
export function resumenFaltante(nombreCliente, lineas) {
  const filas = Array.isArray(lineas) ? lineas : [];
  const unidades = filas.reduce((s, l) => s + (Number(l?.cantidad_abierta) || 0), 0);
  if (!filas.length || unidades <= 0) return null;

  const refs = new Set(filas.map((l) => `${l?.referencia}|${l?.calidad}`)).size;
  const escalada = filas.some((l) => (Number(l?.veces_aplazado) || 0) >= 3);

  // «Le faltaron 7» con un producto; «Le faltaron 7 (3 refs)» con varios. El
  // número grande primero porque es lo que se lee al barrer 200 filas sin leer
  // ninguna; el desglose sólo cuando de verdad hay desglose.
  const corto = `Le faltaron ${unidades}${refs > 1 ? ` (${refs} refs)` : ''}`;

  // Seis líneas de detalle como máximo. El title de un chip no es un informe:
  // con quince productos se sale de la pantalla y no se puede ni leer. Para eso
  // está /faltantes, y el propio texto lo dice en vez de dejarla adivinando.
  const trozos = filas.slice(0, 6).map((l) => {
    const espera = (Number(l?.veces_aplazado) || 0) >= 2 ? `, ${l.veces_aplazado} repartos de espera` : '';
    return `${Number(l?.cantidad_abierta) || 0} de ${l?.referencia || '—'} / ${l?.calidad || '—'}`
      + ` — desde el ${formatFechaCorta(l?.created_at)}${espera}`;
  });
  const cola = filas.length > 6 ? ` …y ${filas.length - 6} más. Míralo completo en Faltantes.` : '';
  const detalle = `Le quedaron faltando a ${nombreCliente}: ${trozos.join('; ')}.`
    + ` Son ${unidades} pacas.${cola} Pulsa para agregarlas al pedido.`;

  return { corto, detalle, unidades, refs, escalada, lineas: filas };
}

/**
 * Cuánto de un faltante queda POR CARGAR al pedido de hoy.
 *
 * Es la aritmética de la idempotencia del CAMBIO 4, y existe porque este
 * proyecto ya duplicó abonos por un doble clic: cargar dos veces el mismo
 * faltante tiene que ser inofensivo. Se compara lo que el libro dice que le
 * falta contra lo que YA se le cargó a las líneas de esta ronda, no contra la
 * cantidad de la línea: si ella subió la cantidad a mano porque el cliente pidió
 * más, eso es pedido nuevo y no cuenta como faltante cargado.
 */
export const porCargar = (abierta, yaCargado) =>
  Math.max(0, (Number(abierta) || 0) - (Number(yaCargado) || 0));

/** «hoy 1.900.000, +200.000» — el sobreprecio, ya en palabras y en pesos. */
export const textoSobreprecio = (hoyPrecio, origen) =>
  `hoy ${formatCOP(hoyPrecio)}, +${formatCOP(Math.max(0, hoyPrecio - origen))}`;
